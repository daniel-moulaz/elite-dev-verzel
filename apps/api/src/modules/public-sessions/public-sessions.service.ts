import { Prisma } from '../../generated/prisma/client.js'
import { SessionStatus } from '../../generated/prisma/enums.js'
import { HttpError } from '../../http/error-response.js'
import { prisma } from '../../lib/prisma.js'

const publicSessionListSelect = {
  id: true,
  startsAt: true,
  venueName: true,
  roomName: true,
  priceCents: true,
  tmdbMovieId: true,
  movieTitle: true,
  moviePosterPath: true,
  movieBackdropPath: true,
  movieReleaseDate: true,
  movieRuntimeMinutes: true,
  _count: { select: { seats: true } },
} satisfies Prisma.SessionSelect

const publicSessionDetailSelect = {
  id: true,
  startsAt: true,
  venueName: true,
  roomName: true,
  address: true,
  priceCents: true,
  tmdbMovieId: true,
  movieTitle: true,
  movieOverview: true,
  moviePosterPath: true,
  movieBackdropPath: true,
  movieReleaseDate: true,
  movieRuntimeMinutes: true,
  _count: { select: { seats: true } },
} satisfies Prisma.SessionSelect

type PublicSessionListRecord = Prisma.SessionGetPayload<{
  select: typeof publicSessionListSelect
}>

type PublicSessionDetailRecord = Prisma.SessionGetPayload<{
  select: typeof publicSessionDetailSelect
}>

interface SeatAvailabilityRecord {
  id: string
  label: string
  rowLabel: string
  number: number
  status: 'AVAILABLE' | 'HELD' | 'SOLD'
}

function releaseDate(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null
}

function toPublicSessionSummary(session: PublicSessionListRecord) {
  return {
    id: session.id,
    startsAt: session.startsAt,
    venueName: session.venueName,
    roomName: session.roomName,
    priceCents: session.priceCents,
    movie: {
      tmdbId: session.tmdbMovieId,
      title: session.movieTitle,
      posterPath: session.moviePosterPath,
      backdropPath: session.movieBackdropPath,
      releaseDate: releaseDate(session.movieReleaseDate),
      runtimeMinutes: session.movieRuntimeMinutes,
    },
    capacity: session._count.seats,
  }
}

function toPublicSessionDetail(session: PublicSessionDetailRecord) {
  return {
    id: session.id,
    startsAt: session.startsAt,
    venueName: session.venueName,
    roomName: session.roomName,
    address: session.address,
    priceCents: session.priceCents,
    movie: {
      tmdbId: session.tmdbMovieId,
      title: session.movieTitle,
      overview: session.movieOverview,
      posterPath: session.moviePosterPath,
      backdropPath: session.movieBackdropPath,
      releaseDate: releaseDate(session.movieReleaseDate),
      runtimeMinutes: session.movieRuntimeMinutes,
    },
    capacity: session._count.seats,
  }
}

export async function listPublicSessions(query?: string) {
  const sessions = await prisma.session.findMany({
    where: {
      status: SessionStatus.PUBLISHED,
      startsAt: { gt: new Date() },
      ...(query
        ? {
            OR: [
              { movieTitle: { contains: query, mode: 'insensitive' } },
              { venueName: { contains: query, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: publicSessionListSelect,
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
  })

  return sessions.map(toPublicSessionSummary)
}

async function findPublicSession(id: string) {
  const session = await prisma.session.findFirst({
    where: {
      id,
      status: SessionStatus.PUBLISHED,
      startsAt: { gt: new Date() },
    },
    select: publicSessionDetailSelect,
  })

  if (!session) {
    throw new HttpError(
      404,
      'SESSION_NOT_FOUND',
      'Sessão não encontrada.',
    )
  }

  return session
}

export async function getPublicSession(id: string) {
  return toPublicSessionDetail(await findPublicSession(id))
}

export async function getPublicSessionSeats(id: string) {
  await findPublicSession(id)

  const seats = await prisma.$queryRaw<SeatAvailabilityRecord[]>`
    WITH database_clock AS MATERIALIZED (
      SELECT clock_timestamp() AS "now"
    )
    SELECT
      seat."id",
      seat."label",
      seat."rowLabel",
      seat."number",
      CASE
        WHEN reservation."status" = 'PENDING'
          AND reservation."expiresAt" > database_clock."now"
          THEN 'HELD'
        WHEN reservation."status" = 'PAID'
          THEN 'SOLD'
        ELSE 'AVAILABLE'
      END AS "status"
    FROM "Seat" AS seat
    CROSS JOIN database_clock
    LEFT JOIN "ReservationSeat" AS allocation
      ON allocation."seatId" = seat."id"
    LEFT JOIN "Reservation" AS reservation
      ON reservation."id" = allocation."reservationId"
    WHERE seat."sessionId" = ${id}::uuid
    ORDER BY seat."rowLabel" ASC, seat."number" ASC
  `

  return { sessionId: id, seats }
}
