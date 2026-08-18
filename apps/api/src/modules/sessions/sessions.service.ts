import type { Prisma } from '../../generated/prisma/client.js'
import { SessionStatus } from '../../generated/prisma/enums.js'
import { HttpError } from '../../http/error-response.js'
import { prisma } from '../../lib/prisma.js'
import type { MovieCatalog } from '../catalog/catalog.types.js'
import type {
  CreateSessionInput,
  UpdateSessionInput,
} from './sessions.schemas.js'

const sessionWithSeats = {
  seats: {
    select: {
      rowLabel: true,
      number: true,
    },
    orderBy: [{ rowLabel: 'asc' }, { number: 'asc' }],
  },
} satisfies Prisma.SessionInclude

type SessionWithSeats = Prisma.SessionGetPayload<{
  include: typeof sessionWithSeats
}>

export interface OrganizerSessionResponse {
  id: string
  status: SessionStatus
  startsAt: Date
  venueName: string
  roomName: string
  address: string
  priceCents: number
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
  movie: {
    tmdbId: number
    title: string
    overview: string
    posterPath: string | null
    backdropPath: string | null
    releaseDate: string | null
    runtimeMinutes: number | null
  }
  capacity: number
  rows: number
  seatsPerRow: number
}

function buildSeats(rows: number, seatsPerRow: number) {
  return Array.from({ length: rows }, (_, rowIndex) => {
    const rowLabel = String.fromCharCode('A'.charCodeAt(0) + rowIndex)

    return Array.from({ length: seatsPerRow }, (_, seatIndex) => {
      const number = seatIndex + 1

      return {
        rowLabel,
        number,
        label: `${rowLabel}${number}`,
      }
    })
  }).flat()
}

function parseMovieReleaseDate(releaseDate: string | null) {
  if (!releaseDate) {
    return null
  }

  const parsedDate = new Date(`${releaseDate}T00:00:00.000Z`)

  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(releaseDate) ||
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== releaseDate
  ) {
    throw new HttpError(
      502,
      'TMDB_UPSTREAM_ERROR',
      'A TMDb retornou dados inválidos para o filme.',
    )
  }

  return parsedDate
}

function movieSnapshot(
  movie: Awaited<ReturnType<MovieCatalog['getMovieDetails']>>,
) {
  return {
    tmdbMovieId: movie.id,
    movieTitle: movie.title,
    movieOverview: movie.overview,
    moviePosterPath: movie.posterPath,
    movieBackdropPath: movie.backdropPath,
    movieReleaseDate: parseMovieReleaseDate(movie.releaseDate),
    movieRuntimeMinutes:
      movie.runtimeMinutes && movie.runtimeMinutes > 0
        ? movie.runtimeMinutes
        : null,
  }
}

function toOrganizerSession(
  session: SessionWithSeats,
): OrganizerSessionResponse {
  const rowSizes = new Map<string, number>()

  for (const seat of session.seats) {
    rowSizes.set(seat.rowLabel, (rowSizes.get(seat.rowLabel) ?? 0) + 1)
  }

  return {
    id: session.id,
    status: session.status,
    startsAt: session.startsAt,
    venueName: session.venueName,
    roomName: session.roomName,
    address: session.address,
    priceCents: session.priceCents,
    publishedAt: session.publishedAt,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    movie: {
      tmdbId: session.tmdbMovieId,
      title: session.movieTitle,
      overview: session.movieOverview,
      posterPath: session.moviePosterPath,
      backdropPath: session.movieBackdropPath,
      releaseDate: session.movieReleaseDate
        ? session.movieReleaseDate.toISOString().slice(0, 10)
        : null,
      runtimeMinutes: session.movieRuntimeMinutes,
    },
    capacity: session.seats.length,
    rows: rowSizes.size,
    seatsPerRow:
      rowSizes.size === 0 ? 0 : Math.max(...Array.from(rowSizes.values())),
  }
}

function ensureFuture(startsAt: Date) {
  if (startsAt.getTime() <= Date.now()) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'A data e hora da sessão devem estar no futuro.',
    )
  }
}

async function findOwnedSession(id: string, organizerId: string) {
  const session = await prisma.session.findFirst({
    where: { id, organizerId },
    include: sessionWithSeats,
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

export async function createOrganizerSession(
  organizerId: string,
  input: CreateSessionInput,
  movieCatalog: MovieCatalog,
) {
  ensureFuture(input.startsAt)

  const movie = await movieCatalog.getMovieDetails(input.tmdbMovieId)
  ensureFuture(input.startsAt)
  const seats = buildSeats(input.rows, input.seatsPerRow)

  const session = await prisma.$transaction((transaction) =>
    transaction.session.create({
      data: {
        organizerId,
        startsAt: input.startsAt,
        venueName: input.venueName,
        roomName: input.roomName,
        address: input.address,
        priceCents: input.priceCents,
        ...movieSnapshot(movie),
        seats: {
          createMany: { data: seats },
        },
      },
      include: sessionWithSeats,
    }),
  )

  return toOrganizerSession(session)
}

export async function listOrganizerSessions(organizerId: string) {
  const sessions = await prisma.session.findMany({
    where: { organizerId },
    include: sessionWithSeats,
    orderBy: [{ startsAt: 'asc' }, { createdAt: 'desc' }],
  })

  return sessions.map(toOrganizerSession)
}

export async function getOrganizerSession(id: string, organizerId: string) {
  return toOrganizerSession(await findOwnedSession(id, organizerId))
}

export async function updateOrganizerSession(
  id: string,
  organizerId: string,
  input: UpdateSessionInput,
  movieCatalog: MovieCatalog,
) {
  const existingSession = await findOwnedSession(id, organizerId)

  if (existingSession.status !== SessionStatus.DRAFT) {
    throw new HttpError(
      409,
      'SESSION_NOT_EDITABLE',
      'Sessões publicadas não podem ser editadas.',
    )
  }

  const startsAt = input.startsAt ?? existingSession.startsAt
  ensureFuture(startsAt)

  const movie =
    input.tmdbMovieId !== undefined &&
    input.tmdbMovieId !== existingSession.tmdbMovieId
      ? await movieCatalog.getMovieDetails(input.tmdbMovieId)
      : null

  ensureFuture(startsAt)

  const updateData: Prisma.SessionUpdateManyMutationInput = {
    updatedAt: new Date(),
    ...(input.startsAt === undefined ? {} : { startsAt: input.startsAt }),
    ...(input.venueName === undefined
      ? {}
      : { venueName: input.venueName }),
    ...(input.roomName === undefined ? {} : { roomName: input.roomName }),
    ...(input.address === undefined ? {} : { address: input.address }),
    ...(input.priceCents === undefined
      ? {}
      : { priceCents: input.priceCents }),
    ...(movie ? movieSnapshot(movie) : {}),
  }

  const session = await prisma.$transaction(async (transaction) => {
    const updateResult = await transaction.session.updateMany({
      where: {
        id,
        organizerId,
        status: SessionStatus.DRAFT,
      },
      data: updateData,
    })

    if (updateResult.count !== 1) {
      throw new HttpError(
        409,
        'SESSION_NOT_EDITABLE',
        'Sessões publicadas não podem ser editadas.',
      )
    }

    if (input.rows !== undefined && input.seatsPerRow !== undefined) {
      await transaction.seat.deleteMany({ where: { sessionId: id } })
      await transaction.seat.createMany({
        data: buildSeats(input.rows, input.seatsPerRow).map((seat) => ({
          ...seat,
          sessionId: id,
        })),
      })
    }

    return transaction.session.findUniqueOrThrow({
      where: { id },
      include: sessionWithSeats,
    })
  })

  return toOrganizerSession(session)
}

export async function publishOrganizerSession(
  id: string,
  organizerId: string,
) {
  const existingSession = await findOwnedSession(id, organizerId)

  if (existingSession.status === SessionStatus.PUBLISHED) {
    throw new HttpError(
      409,
      'SESSION_ALREADY_PUBLISHED',
      'A sessão já está publicada.',
    )
  }

  if (existingSession.startsAt.getTime() <= Date.now()) {
    throw new HttpError(
      409,
      'SESSION_NOT_PUBLISHABLE',
      'A sessão precisa estar no futuro para ser publicada.',
    )
  }

  if (existingSession.seats.length === 0) {
    throw new HttpError(
      409,
      'SESSION_NOT_PUBLISHABLE',
      'A sessão precisa ter ao menos um assento para ser publicada.',
    )
  }

  const publishedAt = new Date()
  const session = await prisma.$transaction(async (transaction) => {
    const updateResult = await transaction.session.updateMany({
      where: {
        id,
        organizerId,
        status: SessionStatus.DRAFT,
        startsAt: { gt: publishedAt },
      },
      data: {
        status: SessionStatus.PUBLISHED,
        publishedAt,
      },
    })

    if (updateResult.count !== 1) {
      throw new HttpError(
        409,
        'SESSION_NOT_PUBLISHABLE',
        'A sessão não está disponível para publicação.',
      )
    }

    return transaction.session.findUniqueOrThrow({
      where: { id },
      include: sessionWithSeats,
    })
  })

  return toOrganizerSession(session)
}
