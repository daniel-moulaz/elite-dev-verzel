import { Prisma } from '../../generated/prisma/client.js'
import {
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
  sessionId: string
  status: ReservationStatus
  startsAt: Date
}

interface LockedReservationSeatRow {
  id: string
  releasedAt: Date | null
}

interface LockedTicketRow {
  id: string
  status: TicketStatus
  ownerId: string
}

interface DatabaseClock {
  now: Date
}

function ticketNotFound() {
  return new HttpError(404, 'TICKET_NOT_FOUND', 'Ingresso não encontrado.')
}

function ticketNotCancellable() {
  return new HttpError(
    409,
    'TICKET_NOT_CANCELLABLE',
    'Somente um ingresso válido pode ser cancelado.',
  )
}

function ticketSessionStarted() {
  return new HttpError(
    409,
    'TICKET_SESSION_STARTED',
    'O ingresso não pode ser cancelado após o início da sessão.',
  )
}

async function lockSeat(transaction: TransactionClient, seatId: string) {
  await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    /* cancel-ticket-lock-seat */
    SELECT "id"
    FROM "Seat"
    WHERE "id" = ${seatId}::uuid
    FOR UPDATE
  `)
}

async function lockReservation(
  transaction: TransactionClient,
  reservationId: string,
) {
  const [reservation] =
    await transaction.$queryRaw<LockedReservationRow[]>(Prisma.sql`
      /* cancel-ticket-lock-reservation */
      SELECT
        reservation."id",
        reservation."sessionId",
        reservation."status",
        session."startsAt"
      FROM "Reservation" AS reservation
      JOIN "Session" AS session
        ON session."id" = reservation."sessionId"
      WHERE reservation."id" = ${reservationId}::uuid
      FOR UPDATE OF reservation
    `)

  return reservation
}

async function lockReservationSeat(
  transaction: TransactionClient,
  reservationSeatId: string,
) {
  const [allocation] =
    await transaction.$queryRaw<LockedReservationSeatRow[]>(Prisma.sql`
      /* cancel-ticket-lock-allocation */
      SELECT "id", "releasedAt"
      FROM "ReservationSeat"
      WHERE "id" = ${reservationSeatId}::uuid
      FOR UPDATE
    `)

  return allocation
}

async function lockTicket(transaction: TransactionClient, ticketId: string) {
  const [ticket] = await transaction.$queryRaw<LockedTicketRow[]>(Prisma.sql`
    /* cancel-ticket-lock-ticket */
    SELECT "id", "status", "ownerId"
    FROM "Ticket"
    WHERE "id" = ${ticketId}::uuid
    FOR UPDATE
  `)

  return ticket
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

async function countNonCancelledTickets(
  transaction: TransactionClient,
  reservationId: string,
) {
  // Conta ingressos VALID ou USED. A reserva só fecha quando esse número
  // chega a zero, ou seja, quando todos os ingressos da compra estão
  // CANCELLED — um ingresso USED nunca deixa a compra "sem pendências".
  const [row] = await transaction.$queryRaw<Array<{ count: number }>>(Prisma.sql`
    /* cancel-ticket-count-non-cancelled */
    SELECT COUNT(*)::int AS "count"
    FROM "Ticket" AS ticket
    JOIN "ReservationSeat" AS allocation
      ON allocation."id" = ticket."reservationSeatId"
    WHERE allocation."reservationId" = ${reservationId}::uuid
      AND ticket."status" != 'CANCELLED'
  `)

  return row?.count ?? 0
}

export async function cancelCustomerTicket(
  ticketId: string,
  customerId: string,
) {
  const initialTicket = await prisma.ticket.findFirst({
    where: { id: ticketId, ownerId: customerId },
    select: {
      reservationSeat: {
        select: { id: true, seatId: true, reservationId: true },
      },
    },
  })

  if (!initialTicket) {
    throw ticketNotFound()
  }

  const { seatId, reservationId, id: reservationSeatId } =
    initialTicket.reservationSeat

  const result = await prisma.$transaction(async (transaction) => {
    await lockSeat(transaction, seatId)

    const reservation = await lockReservation(transaction, reservationId)

    if (!reservation) {
      throw ticketNotFound()
    }

    const allocation = await lockReservationSeat(transaction, reservationSeatId)

    if (!allocation) {
      throw ticketNotFound()
    }

    const ticket = await lockTicket(transaction, ticketId)

    if (!ticket || ticket.ownerId !== customerId) {
      throw ticketNotFound()
    }

    if (ticket.status !== TicketStatus.VALID) {
      throw ticketNotCancellable()
    }

    const clock = await getDatabaseClock(transaction)

    if (reservation.startsAt.getTime() <= clock.now.getTime()) {
      throw ticketSessionStarted()
    }

    if (reservation.status !== ReservationStatus.PAID || allocation.releasedAt !== null) {
      throw new Error(
        'O ingresso válido não corresponde a uma compra paga com alocação ativa.',
      )
    }

    const cancelledTicket = await transaction.ticket.updateMany({
      where: { id: ticket.id, status: TicketStatus.VALID },
      data: { status: TicketStatus.CANCELLED },
    })

    if (cancelledTicket.count !== 1) {
      throw new Error('O ingresso mudou de estado durante o cancelamento.')
    }

    const releasedAllocation = await transaction.reservationSeat.updateMany({
      where: { id: allocation.id, releasedAt: null },
      data: { releasedAt: clock.now },
    })

    if (releasedAllocation.count !== 1) {
      throw new Error('O assento do ingresso não pôde ser liberado.')
    }

    const nonCancelledTickets = await countNonCancelledTickets(
      transaction,
      reservation.id,
    )

    let finalReservationStatus: ReservationStatus = reservation.status

    if (nonCancelledTickets === 0) {
      const closedReservation = await transaction.reservation.updateMany({
        where: { id: reservation.id, status: ReservationStatus.PAID },
        data: { status: ReservationStatus.CANCELLED },
      })

      if (closedReservation.count !== 1) {
        throw new Error('A compra mudou de estado durante o cancelamento.')
      }

      finalReservationStatus = ReservationStatus.CANCELLED
    }

    return {
      sessionId: reservation.sessionId,
      closedReservation: finalReservationStatus === ReservationStatus.CANCELLED,
      ticket: { id: ticket.id, status: TicketStatus.CANCELLED },
      reservation: { id: reservation.id, status: finalReservationStatus },
    }
  })

  // Publicado somente após o commit: o assento já voltou ao estoque.
  if (result.closedReservation) {
    cancelScheduledInvalidation(result.reservation.id)
  }

  publishSeatsChanged(result.sessionId)

  return {
    ticket: result.ticket,
    reservation: result.reservation,
  }
}
