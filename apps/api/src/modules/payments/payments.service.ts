import { Prisma } from '../../generated/prisma/client.js'
import {
  PaymentStatus,
  ReservationStatus,
} from '../../generated/prisma/enums.js'
import { HttpError } from '../../http/error-response.js'
import { prisma } from '../../lib/prisma.js'
import {
  cancelScheduledInvalidation,
  publishSeatsChanged,
} from '../../realtime/session-events.js'
import { generateManualCode } from '../tickets/ticket-crypto.js'
import type { ProcessPaymentInput } from './payments.schemas.js'

type TransactionClient = Prisma.TransactionClient

interface LockedReservationRow {
  id: string
  customerId: string
  sessionId: string
  status: ReservationStatus
  expiresAt: Date
  totalCents: number
}

interface LockedReservationSeatRow {
  id: string
  seatId: string
  unitPriceCents: number
}

interface DatabaseClock {
  now: Date
}

type PaymentTransactionResult =
  | {
      kind: 'processed'
      payment: {
        id: string
        status: PaymentStatus
        amountCents: number
        createdAt: Date
      }
      reservation: {
        id: string
        status: ReservationStatus
      }
      tickets: Array<{ id: string }>
    }
  | { kind: 'expired'; releasedAllocations: number }
  | { kind: 'already-processed' }
  | { kind: 'not-available' }

function uuidList(ids: string[]) {
  return Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))
}

function reservationNotFound() {
  return new HttpError(
    404,
    'RESERVATION_NOT_FOUND',
    'Reserva não encontrada.',
  )
}

function reservationExpired() {
  return new HttpError(
    409,
    'RESERVATION_EXPIRED',
    'A reserva expirou e os assentos foram liberados.',
  )
}

function paymentAlreadyProcessed() {
  return new HttpError(
    409,
    'PAYMENT_ALREADY_PROCESSED',
    'A reserva já possui um resultado final.',
  )
}

function paymentNotAvailable() {
  return new HttpError(
    409,
    'PAYMENT_NOT_AVAILABLE',
    'A reserva não está disponível para pagamento.',
  )
}

async function lockSeats(
  transaction: TransactionClient,
  sortedSeatIds: string[],
) {
  if (sortedSeatIds.length === 0) {
    return
  }

  await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
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
      SELECT "id", "customerId", "sessionId", "status", "expiresAt", "totalCents"
      FROM "Reservation"
      WHERE "id" = ${reservationId}::uuid
      ORDER BY "id" ASC
      FOR UPDATE
    `)

  return reservation
}

async function lockReservationSeats(
  transaction: TransactionClient,
  reservationId: string,
) {
  return transaction.$queryRaw<LockedReservationSeatRow[]>(Prisma.sql`
    SELECT "id", "seatId", "unitPriceCents"
    FROM "ReservationSeat"
    WHERE "reservationId" = ${reservationId}::uuid
      AND "releasedAt" IS NULL
    ORDER BY "seatId" ASC
    FOR UPDATE
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

function isFinalizationConflict(error: unknown) {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false
  }

  const modelName = error.meta?.modelName
  const target = error.meta?.target
  const targetFields = Array.isArray(target)
    ? target.filter((field): field is string => typeof field === 'string')
    : typeof target === 'string'
      ? [target]
      : []

  return (
    modelName === 'Payment' ||
    (modelName === 'Ticket' &&
      targetFields.some((field) => field.includes('reservationSeatId')))
  )
}

async function createApprovedPayment(
  transaction: TransactionClient,
  reservation: LockedReservationRow,
  reservationSeats: LockedReservationSeatRow[],
  now: Date,
): Promise<Extract<PaymentTransactionResult, { kind: 'processed' }>> {
  const payment = await transaction.payment.create({
    data: {
      reservationId: reservation.id,
      status: PaymentStatus.APPROVED,
      amountCents: reservation.totalCents,
    },
    select: {
      id: true,
      status: true,
      amountCents: true,
      createdAt: true,
    },
  })

  const paidReservation = await transaction.reservation.update({
    where: { id: reservation.id },
    data: { status: ReservationStatus.PAID },
    select: { id: true, status: true },
  })

  const tickets: Array<{ id: string }> = []

  for (const reservationSeat of reservationSeats) {
    const ticket = await transaction.ticket.create({
      data: {
        reservationSeatId: reservationSeat.id,
        sessionId: reservation.sessionId,
        ownerId: reservation.customerId,
        manualCode: generateManualCode(),
        issuedAt: now,
      },
      select: { id: true },
    })

    tickets.push(ticket)
  }

  return {
    kind: 'processed',
    payment,
    reservation: paidReservation,
    tickets,
  }
}

async function createDeclinedPayment(
  transaction: TransactionClient,
  reservation: LockedReservationRow,
  now: Date,
): Promise<Extract<PaymentTransactionResult, { kind: 'processed' }>> {
  const payment = await transaction.payment.create({
    data: {
      reservationId: reservation.id,
      status: PaymentStatus.DECLINED,
      amountCents: reservation.totalCents,
    },
    select: {
      id: true,
      status: true,
      amountCents: true,
      createdAt: true,
    },
  })

  const cancelledReservation = await transaction.reservation.update({
    where: { id: reservation.id },
    data: { status: ReservationStatus.CANCELLED },
    select: { id: true, status: true },
  })

  await transaction.reservationSeat.updateMany({
    where: {
      reservationId: reservation.id,
      releasedAt: null,
    },
    data: { releasedAt: now },
  })

  return {
    kind: 'processed',
    payment,
    reservation: cancelledReservation,
    tickets: [],
  }
}

export async function processReservationPayment(
  reservationId: string,
  customerId: string,
  input: ProcessPaymentInput,
) {
  const initialReservation = await prisma.reservation.findFirst({
    where: { id: reservationId, customerId },
    select: {
      sessionId: true,
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

  const { sessionId } = initialReservation
  const sortedSeatIds = initialReservation.seats.map(({ seatId }) => seatId)
  let result: PaymentTransactionResult

  try {
    result = await prisma.$transaction(async (transaction) => {
      await lockSeats(transaction, sortedSeatIds)

      const reservation = await lockReservation(transaction, reservationId)

      if (!reservation || reservation.customerId !== customerId) {
        throw reservationNotFound()
      }

      const reservationSeats = await lockReservationSeats(
        transaction,
        reservation.id,
      )
      const clock = await getDatabaseClock(transaction)

      if (reservation.status === ReservationStatus.EXPIRED) {
        let releasedAllocations = 0

        if (reservationSeats.length > 0) {
          const released = await transaction.reservationSeat.updateMany({
            where: {
              reservationId: reservation.id,
              releasedAt: null,
            },
            data: { releasedAt: clock.now },
          })

          releasedAllocations = released.count
        }

        return { kind: 'expired', releasedAllocations }
      }

      if (reservation.status !== ReservationStatus.PENDING) {
        return { kind: 'already-processed' }
      }

      if (reservation.expiresAt.getTime() <= clock.now.getTime()) {
        await transaction.reservation.update({
          where: { id: reservation.id },
          data: { status: ReservationStatus.EXPIRED },
        })
        const released = await transaction.reservationSeat.updateMany({
          where: {
            reservationId: reservation.id,
            releasedAt: null,
          },
          data: { releasedAt: clock.now },
        })

        return { kind: 'expired', releasedAllocations: released.count }
      }

      if (reservationSeats.length === 0) {
        return { kind: 'not-available' }
      }

      const seatsTotal = reservationSeats.reduce(
        (sum, seat) => sum + seat.unitPriceCents,
        0,
      )

      if (seatsTotal !== reservation.totalCents) {
        throw new Error('A reserva possui um total inconsistente.')
      }

      if (input.outcome === PaymentStatus.APPROVED) {
        return createApprovedPayment(
          transaction,
          reservation,
          reservationSeats,
          clock.now,
        )
      }

      return createDeclinedPayment(transaction, reservation, clock.now)
    })
  } catch (error) {
    if (isFinalizationConflict(error)) {
      throw paymentAlreadyProcessed()
    }

    throw error
  }

  // A partir daqui a transação já commitou: nenhum evento é publicado para
  // trabalho que sofreu rollback.
  if (result.kind === 'expired') {
    if (result.releasedAllocations > 0) {
      publishSeatsChanged(sessionId)
    }

    throw reservationExpired()
  }

  if (result.kind === 'already-processed') {
    throw paymentAlreadyProcessed()
  }

  if (result.kind === 'not-available') {
    throw paymentNotAvailable()
  }

  // Aprovação muda a representação pública de HELD para SOLD; recusa devolve
  // os assentos ao estoque. Ambos alteram o mapa.
  cancelScheduledInvalidation(result.reservation.id)
  publishSeatsChanged(sessionId)

  return {
    payment: result.payment,
    reservation: result.reservation,
    tickets: result.tickets,
  }
}
