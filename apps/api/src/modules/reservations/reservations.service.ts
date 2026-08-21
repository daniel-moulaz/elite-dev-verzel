import { Prisma } from '../../generated/prisma/client.js'
import {
  ReservationStatus,
  SessionStatus,
} from '../../generated/prisma/enums.js'
import { HttpError } from '../../http/error-response.js'
import { prisma } from '../../lib/prisma.js'
import {
  publishSeatsChanged,
  scheduleSeatsInvalidation,
} from '../../realtime/session-events.js'
import type { CreateReservationInput } from './reservations.schemas.js'

export const HOLD_DURATION_MINUTES = 10

const reservationDetails = {
  session: {
    select: {
      id: true,
      startsAt: true,
      venueName: true,
      roomName: true,
      address: true,
      movieTitle: true,
      moviePosterPath: true,
    },
  },
  seats: {
    where: {
      releasedAt: null,
    },
    select: {
      unitPriceCents: true,
      seat: {
        select: {
          id: true,
          label: true,
          rowLabel: true,
          number: true,
        },
      },
    },
    orderBy: {
      seat: {
        label: 'asc',
      },
    },
  },
} satisfies Prisma.ReservationInclude

type ReservationWithDetails = Prisma.ReservationGetPayload<{
  include: typeof reservationDetails
}>

interface LockedReservationRow {
  id: string
  status: ReservationStatus
  expiresAt: Date
}

interface DatabaseClock {
  now: Date
  expiresAt: Date
}

type CreateHoldResult =
  | {
      kind: 'created'
      reservation: ReservationWithDetails
      releasedAllocations: number
    }
  | { kind: 'conflict'; releasedAllocations: number }

type TransactionClient = Prisma.TransactionClient

function seatUnavailable() {
  return new HttpError(
    409,
    'SEAT_UNAVAILABLE',
    'Um ou mais assentos não estão mais disponíveis.',
  )
}

function sessionNotAvailable() {
  return new HttpError(
    409,
    'SESSION_NOT_AVAILABLE',
    'A sessão não está disponível para reserva.',
  )
}

function toReservationResponse(reservation: ReservationWithDetails) {
  return {
    id: reservation.id,
    status: reservation.status,
    expiresAt: reservation.expiresAt,
    totalCents: reservation.totalCents,
    createdAt: reservation.createdAt,
    session: {
      id: reservation.session.id,
      movie: {
        title: reservation.session.movieTitle,
        posterPath: reservation.session.moviePosterPath,
      },
      startsAt: reservation.session.startsAt,
      venueName: reservation.session.venueName,
      roomName: reservation.session.roomName,
      address: reservation.session.address,
    },
    seats: reservation.seats.map(({ seat, unitPriceCents }) => ({
      id: seat.id,
      label: seat.label,
      rowLabel: seat.rowLabel,
      number: seat.number,
      unitPriceCents,
    })),
  }
}

function uuidList(ids: string[]) {
  return Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))
}

interface LockedSessionRow {
  id: string
  status: SessionStatus
  startsAt: Date
  priceCents: number
}

/**
 * Primeiro lock da ordem global `Session -> Seat -> Reservation ->
 * ReservationSeat -> Ticket`. `FOR SHARE` permite que várias reservas
 * concorrentes prossigam entre si, mas bloqueia a edição estrutural
 * (`FOR UPDATE`) do organizador — garantindo que preço, horário e layout lidos
 * aqui não fiquem obsoletos até o commit.
 */
async function lockSessionForShare(
  transaction: TransactionClient,
  sessionId: string,
) {
  const [session] = await transaction.$queryRaw<LockedSessionRow[]>(Prisma.sql`
    /* create-hold-lock-session */
    SELECT "id", "status", "startsAt", "priceCents"
    FROM "Session"
    WHERE "id" = ${sessionId}::uuid
    FOR SHARE
  `)

  return session
}

async function lockSeats(
  transaction: TransactionClient,
  sessionId: string,
  sortedSeatIds: string[],
) {
  return transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    /* create-hold-lock-seats */
    SELECT "id"
    FROM "Seat"
    WHERE "sessionId" = ${sessionId}::uuid
      AND "id" IN (${uuidList(sortedSeatIds)})
    ORDER BY "id" ASC
    FOR UPDATE
  `)
}

async function lockReservationsForSeats(
  transaction: TransactionClient,
  sortedSeatIds: string[],
) {
  return transaction.$queryRaw<LockedReservationRow[]>(Prisma.sql`
    SELECT r."id", r."status", r."expiresAt"
    FROM "Reservation" r
    WHERE r."id" IN (
      SELECT rs."reservationId"
      FROM "ReservationSeat" rs
      WHERE rs."seatId" IN (${uuidList(sortedSeatIds)})
        AND rs."releasedAt" IS NULL
    )
    ORDER BY r."id" ASC
    FOR UPDATE
  `)
}

async function lockReservation(
  transaction: TransactionClient,
  reservationId: string,
) {
  await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "Reservation"
    WHERE "id" = ${reservationId}::uuid
    ORDER BY "id" ASC
    FOR UPDATE
  `)
}

async function getDatabaseClock(transaction: TransactionClient) {
  const [clock] = await transaction.$queryRaw<DatabaseClock[]>(Prisma.sql`
    SELECT db_now AS "now",
           db_now + ${HOLD_DURATION_MINUTES} * INTERVAL '1 minute' AS "expiresAt"
    FROM (SELECT clock_timestamp() AS db_now) AS database_clock
  `)

  if (!clock) {
    throw new Error('Não foi possível obter o horário do PostgreSQL.')
  }

  return clock
}

function expiredPendingReservationIds(
  reservations: LockedReservationRow[],
  now: Date,
) {
  return reservations
    .filter(
      (reservation) =>
        reservation.status === ReservationStatus.PENDING &&
        reservation.expiresAt.getTime() <= now.getTime(),
    )
    .map(({ id }) => id)
}

function releasableReservationIds(
  reservations: LockedReservationRow[],
  now: Date,
) {
  return reservations
    .filter(
      (reservation) =>
        reservation.status === ReservationStatus.EXPIRED ||
        reservation.status === ReservationStatus.CANCELLED ||
        (reservation.status === ReservationStatus.PENDING &&
          reservation.expiresAt.getTime() <= now.getTime()),
    )
    .map(({ id }) => id)
}

async function releaseExpiredAllocations(
  transaction: TransactionClient,
  reservations: LockedReservationRow[],
  now: Date,
) {
  const expiredPendingIds = expiredPendingReservationIds(reservations, now)
  const releasableIds = releasableReservationIds(reservations, now)

  if (expiredPendingIds.length > 0) {
    await transaction.reservation.updateMany({
      where: {
        id: { in: expiredPendingIds },
        status: ReservationStatus.PENDING,
        expiresAt: { lte: now },
      },
      data: { status: ReservationStatus.EXPIRED },
    })
  }

  let releasedAllocations = 0

  if (releasableIds.length > 0) {
    const released = await transaction.reservationSeat.updateMany({
      where: {
        reservationId: { in: releasableIds },
        releasedAt: null,
      },
      data: { releasedAt: now },
    })

    releasedAllocations = released.count
  }

  return { releasableIds: new Set(releasableIds), releasedAllocations }
}

function isSeatBlocked(
  reservations: LockedReservationRow[],
  releasableIds: Set<string>,
) {
  return reservations.some(
    (reservation) => !releasableIds.has(reservation.id),
  )
}

function isUniqueSeatConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  )
}

export async function createReservationHold(
  customerId: string,
  input: CreateReservationInput,
) {
  const sortedSeatIds = [...input.seatIds].sort((left, right) =>
    left.localeCompare(right),
  )

  let result: CreateHoldResult

  try {
    result = await prisma.$transaction(async (transaction) => {
      const session = await lockSessionForShare(transaction, input.sessionId)

      if (!session || session.status !== SessionStatus.PUBLISHED) {
        throw sessionNotAvailable()
      }

      const lockedSeats = await lockSeats(
        transaction,
        session.id,
        sortedSeatIds,
      )

      if (lockedSeats.length !== sortedSeatIds.length) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          'Um ou mais assentos não pertencem à sessão informada.',
        )
      }

      const lockedReservations = await lockReservationsForSeats(
        transaction,
        sortedSeatIds,
      )
      const clock = await getDatabaseClock(transaction)

      if (session.startsAt.getTime() <= clock.now.getTime()) {
        throw sessionNotAvailable()
      }

      const { releasableIds, releasedAllocations } =
        await releaseExpiredAllocations(
          transaction,
          lockedReservations,
          clock.now,
        )

      if (isSeatBlocked(lockedReservations, releasableIds)) {
        return { kind: 'conflict', releasedAllocations }
      }

      const reservation = await transaction.reservation.create({
        data: {
          customerId,
          sessionId: session.id,
          expiresAt: clock.expiresAt,
          totalCents: session.priceCents * sortedSeatIds.length,
          seats: {
            create: sortedSeatIds.map((seatId) => ({
              seatId,
              unitPriceCents: session.priceCents,
            })),
          },
        },
        include: reservationDetails,
      })

      return { kind: 'created', reservation, releasedAllocations }
    })
  } catch (error) {
    if (isUniqueSeatConflict(error)) {
      throw seatUnavailable()
    }

    throw error
  }

  // A partir daqui a transação já commitou: nenhum evento é publicado para
  // trabalho que sofreu rollback.
  if (result.kind === 'conflict') {
    // Mesmo em conflito a transação pode ter liberado holds vencidos.
    if (result.releasedAllocations > 0) {
      publishSeatsChanged(input.sessionId)
    }

    throw seatUnavailable()
  }

  publishSeatsChanged(input.sessionId)
  scheduleSeatsInvalidation(
    result.reservation.id,
    input.sessionId,
    result.reservation.expiresAt,
  )

  return toReservationResponse(result.reservation)
}

export async function getCustomerReservation(
  reservationId: string,
  customerId: string,
) {
  const result = await prisma.$transaction(async (transaction) => {
    const initialReservation = await transaction.reservation.findFirst({
      where: { id: reservationId, customerId },
      include: reservationDetails,
    })

    if (!initialReservation) {
      throw new HttpError(
        404,
        'RESERVATION_NOT_FOUND',
        'Reserva não encontrada.',
      )
    }

    if (
      initialReservation.status !== ReservationStatus.PENDING &&
      initialReservation.status !== ReservationStatus.EXPIRED &&
      initialReservation.status !== ReservationStatus.CANCELLED
    ) {
      return { reservation: initialReservation, releasedAllocations: 0 }
    }

    const sortedSeatIds = initialReservation.seats
      .map(({ seat }) => seat.id)
      .sort((left, right) => left.localeCompare(right))

    if (sortedSeatIds.length > 0) {
      await lockSeats(
        transaction,
        initialReservation.sessionId,
        sortedSeatIds,
      )
    }

    await lockReservation(transaction, initialReservation.id)
    const clock = await getDatabaseClock(transaction)
    const currentReservation =
      await transaction.reservation.findUniqueOrThrow({
        where: { id: initialReservation.id },
        include: reservationDetails,
      })

    const shouldExpire =
      currentReservation.status === ReservationStatus.PENDING &&
      currentReservation.expiresAt.getTime() <= clock.now.getTime()
    const shouldRelease =
      shouldExpire ||
      currentReservation.status === ReservationStatus.EXPIRED ||
      currentReservation.status === ReservationStatus.CANCELLED

    if (shouldExpire) {
      await transaction.reservation.update({
        where: { id: currentReservation.id },
        data: { status: ReservationStatus.EXPIRED },
      })
    }

    let releasedAllocations = 0

    if (shouldRelease && currentReservation.seats.length > 0) {
      const released = await transaction.reservationSeat.updateMany({
        where: {
          reservationId: currentReservation.id,
          releasedAt: null,
        },
        data: { releasedAt: clock.now },
      })

      releasedAllocations = released.count
    }

    if (!shouldExpire && !shouldRelease) {
      return { reservation: currentReservation, releasedAllocations }
    }

    return {
      reservation: await transaction.reservation.findUniqueOrThrow({
        where: { id: currentReservation.id },
        include: reservationDetails,
      }),
      releasedAllocations,
    }
  })

  // Publicado somente após o commit da expiração lazy.
  if (result.releasedAllocations > 0) {
    publishSeatsChanged(result.reservation.sessionId)
  }

  return toReservationResponse(result.reservation)
}
