import { Prisma } from '../../generated/prisma/client.js'
import {
  PaymentStatus,
  ReservationStatus,
  TicketStatus,
} from '../../generated/prisma/enums.js'
import { HttpError } from '../../http/error-response.js'
import { prisma } from '../../lib/prisma.js'
import {
  cancelScheduledInvalidation,
  publishSeatsChanged,
} from '../../realtime/session-events.js'

type TransactionClient = Prisma.TransactionClient

interface LockedReservationRow {
  id: string
  customerId: string
  sessionId: string
  status: ReservationStatus
  startsAt: Date
  totalCents: number
}

interface LockedReservationSeatRow {
  id: string
  seatId: string
}

interface LockedTicketRow {
  id: string
  status: TicketStatus
}

interface DatabaseClock {
  now: Date
}

function reservationNotFound() {
  return new HttpError(
    404,
    'RESERVATION_NOT_FOUND',
    'Reserva não encontrada.',
  )
}

function reservationAlreadyCancelled() {
  return new HttpError(
    409,
    'RESERVATION_ALREADY_CANCELLED',
    'Esta compra já foi cancelada.',
  )
}

function reservationNotCancellable() {
  return new HttpError(
    409,
    'RESERVATION_NOT_CANCELLABLE',
    'Somente uma compra paga pode ser cancelada.',
  )
}

function reservationSessionStarted() {
  return new HttpError(
    409,
    'RESERVATION_SESSION_STARTED',
    'A compra não pode ser cancelada após o início da sessão.',
  )
}

function reservationHasUsedTicket() {
  return new HttpError(
    409,
    'RESERVATION_HAS_USED_TICKET',
    'A compra não pode ser cancelada porque um de seus ingressos já foi utilizado.',
  )
}

function uuidList(ids: string[]) {
  return Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))
}

async function lockSeats(
  transaction: TransactionClient,
  sortedSeatIds: string[],
) {
  if (sortedSeatIds.length === 0) {
    return
  }

  await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    /* cancel-reservation-lock-seats */
    SELECT "id"
    FROM "Seat"
    WHERE "id" IN (${uuidList(sortedSeatIds)})
    ORDER BY "id" ASC
    FOR UPDATE
  `)
}

async function lockReservation(
  transaction: TransactionClient,
  reservationId: string,
) {
  const [reservation] =
    await transaction.$queryRaw<LockedReservationRow[]>(Prisma.sql`
      /* cancel-reservation-lock-reservation */
      SELECT
        reservation."id",
        reservation."customerId",
        reservation."sessionId",
        reservation."status",
        reservation."totalCents",
        session."startsAt"
      FROM "Reservation" AS reservation
      JOIN "Session" AS session
        ON session."id" = reservation."sessionId"
      WHERE reservation."id" = ${reservationId}::uuid
      FOR UPDATE OF reservation
    `)

  return reservation
}

async function lockActiveReservationSeats(
  transaction: TransactionClient,
  reservationId: string,
) {
  return transaction.$queryRaw<LockedReservationSeatRow[]>(Prisma.sql`
    /* cancel-reservation-lock-allocations */
    SELECT "id", "seatId"
    FROM "ReservationSeat"
    WHERE "reservationId" = ${reservationId}::uuid
      AND "releasedAt" IS NULL
    ORDER BY "seatId" ASC
    FOR UPDATE
  `)
}

async function lockTickets(
  transaction: TransactionClient,
  reservationId: string,
) {
  return transaction.$queryRaw<LockedTicketRow[]>(Prisma.sql`
    /* cancel-reservation-lock-tickets */
    SELECT ticket."id", ticket."status"
    FROM "Ticket" AS ticket
    JOIN "ReservationSeat" AS allocation
      ON allocation."id" = ticket."reservationSeatId"
    WHERE allocation."reservationId" = ${reservationId}::uuid
    ORDER BY ticket."id" ASC
    FOR UPDATE OF ticket
  `)
}

async function getDatabaseClock(transaction: TransactionClient) {
  const [clock] = await transaction.$queryRaw<DatabaseClock[]>(Prisma.sql`
    SELECT clock_timestamp() AS "now"
  `)

  if (!clock) {
    throw new Error('Não foi possível obter o horário do PostgreSQL.')
  }

  return clock
}

function assertPaidPurchaseConsistency(input: {
  reservation: LockedReservationRow
  allocations: LockedReservationSeatRow[]
  cancellableTickets: LockedTicketRow[]
  payment: { status: PaymentStatus; amountCents: number } | null
}) {
  const { reservation, allocations, cancellableTickets, payment } = input

  if (
    allocations.length === 0 ||
    cancellableTickets.length !== allocations.length ||
    !payment ||
    payment.status !== PaymentStatus.APPROVED ||
    payment.amountCents !== reservation.totalCents ||
    cancellableTickets.some(({ status }) => status !== TicketStatus.VALID)
  ) {
    throw new Error('A compra paga possui dados transacionais inconsistentes.')
  }
}

export async function cancelCustomerReservation(
  reservationId: string,
  customerId: string,
) {
  const initialReservation = await prisma.reservation.findFirst({
    where: { id: reservationId, customerId },
    select: {
      seats: {
        where: { releasedAt: null },
        select: { seatId: true },
        orderBy: { seatId: 'asc' },
      },
    },
  })

  if (!initialReservation) {
    throw reservationNotFound()
  }

  const sortedSeatIds = initialReservation.seats.map(({ seatId }) => seatId)

  const result = await prisma.$transaction(async (transaction) => {
    await lockSeats(transaction, sortedSeatIds)

    const reservation = await lockReservation(transaction, reservationId)

    if (!reservation || reservation.customerId !== customerId) {
      throw reservationNotFound()
    }

    if (reservation.status === ReservationStatus.CANCELLED) {
      throw reservationAlreadyCancelled()
    }

    if (reservation.status !== ReservationStatus.PAID) {
      throw reservationNotCancellable()
    }

    const allocations = await lockActiveReservationSeats(
      transaction,
      reservation.id,
    )
    const tickets = await lockTickets(transaction, reservation.id)
    const clock = await getDatabaseClock(transaction)

    if (tickets.some(({ status }) => status === TicketStatus.USED)) {
      throw reservationHasUsedTicket()
    }

    if (reservation.startsAt.getTime() <= clock.now.getTime()) {
      throw reservationSessionStarted()
    }

    // Tickets já cancelados individualmente (POST /me/tickets/:id/cancel)
    // convivem com os ainda VALID; o cancelamento integral só transiciona
    // os que ainda estão canceláveis.
    const cancellableTickets = tickets.filter(
      ({ status }) => status === TicketStatus.VALID,
    )

    const payment = await transaction.payment.findUnique({
      where: { reservationId: reservation.id },
      select: { status: true, amountCents: true },
    })

    assertPaidPurchaseConsistency({
      reservation,
      allocations,
      cancellableTickets,
      payment,
    })

    const cancelledTickets = await transaction.ticket.updateMany({
      where: {
        id: { in: cancellableTickets.map(({ id }) => id) },
        status: TicketStatus.VALID,
      },
      data: { status: TicketStatus.CANCELLED },
    })

    if (cancelledTickets.count !== cancellableTickets.length) {
      throw new Error('Nem todos os ingressos da compra foram cancelados.')
    }

    const cancelledReservation = await transaction.reservation.updateMany({
      where: {
        id: reservation.id,
        customerId,
        status: ReservationStatus.PAID,
      },
      data: { status: ReservationStatus.CANCELLED },
    })

    if (cancelledReservation.count !== 1) {
      throw new Error('A compra mudou de estado durante o cancelamento.')
    }

    const releasedAllocations = await transaction.reservationSeat.updateMany({
      where: {
        id: { in: allocations.map(({ id }) => id) },
        releasedAt: null,
      },
      data: { releasedAt: clock.now },
    })

    if (releasedAllocations.count !== allocations.length) {
      throw new Error('Nem todos os assentos da compra foram liberados.')
    }

    return {
      sessionId: reservation.sessionId,
      reservation: {
        id: reservation.id,
        status: ReservationStatus.CANCELLED,
      },
      tickets: cancellableTickets.map(({ id }) => ({
        id,
        status: TicketStatus.CANCELLED,
      })),
    }
  })

  // Publicado somente após o commit: os assentos já voltaram ao estoque.
  cancelScheduledInvalidation(result.reservation.id)
  publishSeatsChanged(result.sessionId)

  return {
    reservation: result.reservation,
    tickets: result.tickets,
  }
}
