import { Prisma } from '../../generated/prisma/client.js'
import { SessionStatus } from '../../generated/prisma/enums.js'
import { HttpError } from '../../http/error-response.js'
import { prisma } from '../../lib/prisma.js'
import {
  publishSeatsChanged,
  publishSessionChanged,
} from '../../realtime/session-events.js'
import type { MovieCatalog } from '../catalog/catalog.types.js'
import {
  getSessionEditability,
  getSessionEditabilityMap,
  sessionLayoutNotEditable,
  sessionNotEditable,
  type SessionEditability,
} from './session-editability.js'
import {
  getSessionMetrics,
  getSessionMetricsMap,
  type SessionMetrics,
} from './session-metrics.js'
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
  editability: SessionEditability
  metrics: SessionMetrics
}

interface LockedSessionRow {
  id: string
  status: SessionStatus
  startsAt: Date
  publishedAt: Date | null
}

function sessionNotFound() {
  return new HttpError(404, 'SESSION_NOT_FOUND', 'Sessão não encontrada.')
}

/**
 * Primeiro lock da ordem global `Session -> Seat -> Reservation ->
 * ReservationSeat -> Ticket`. Nenhum outro fluxo trava a linha de `Session`,
 * então adquiri-la primeiro não inverte a ordem de pagamento, portaria ou
 * cancelamento.
 */
async function lockSessionForUpdate(
  transaction: Prisma.TransactionClient,
  sessionId: string,
  organizerId: string,
) {
  const [session] = await transaction.$queryRaw<LockedSessionRow[]>(Prisma.sql`
    /* update-session-lock-session */
    SELECT "id", "status", "startsAt", "publishedAt"
    FROM "Session"
    WHERE "id" = ${sessionId}::uuid
      AND "organizerId" = ${organizerId}::uuid
    FOR UPDATE
  `)

  return session
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
  editability: SessionEditability,
  metrics: SessionMetrics,
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
    editability,
    metrics,
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

  // Um rascunho recém-criado nunca tem reserva, ingresso ou alocação.
  return toOrganizerSession(
    session,
    { allowed: true, reason: 'DRAFT', layoutEditable: true },
    {
      capacity: session.seats.length,
      availableSeats: session.seats.length,
      heldSeats: 0,
      soldSeats: 0,
      occupancyPercentage: 0,
      simulatedRevenueCents: 0,
    },
  )
}

export async function listOrganizerSessions(organizerId: string) {
  const sessions = await prisma.session.findMany({
    where: { organizerId },
    include: sessionWithSeats,
    orderBy: [{ startsAt: 'asc' }, { createdAt: 'desc' }],
  })

  // Duas consultas agregadas para a lista inteira, nunca uma por sessão.
  const [editabilityById, metricsById] = await Promise.all([
    getSessionEditabilityMap(sessions),
    getSessionMetricsMap(sessions.map(({ id }) => id)),
  ])

  return sessions.map((session) =>
    toOrganizerSession(
      session,
      editabilityById.get(session.id) ?? {
        allowed: false,
        reason: 'COMMERCIAL_HISTORY',
        layoutEditable: false,
      },
      metricsById.get(session.id) ?? {
        capacity: session.seats.length,
        availableSeats: 0,
        heldSeats: 0,
        soldSeats: 0,
        occupancyPercentage: 0,
        simulatedRevenueCents: 0,
      },
    ),
  )
}

export async function getOrganizerSession(id: string, organizerId: string) {
  const session = await findOwnedSession(id, organizerId)
  const [editability, metrics] = await Promise.all([
    getSessionEditability(session.id, session.status),
    getSessionMetrics(session.id),
  ])

  return toOrganizerSession(session, editability, metrics)
}

export async function updateOrganizerSession(
  id: string,
  organizerId: string,
  input: UpdateSessionInput,
  movieCatalog: MovieCatalog,
) {
  const existingSession = await findOwnedSession(id, organizerId)
  const startsAt = input.startsAt ?? existingSession.startsAt

  // Só o horário explicitamente enviado é validado antes da transação. Uma
  // sessão que já começou deve receber o motivo real da recusa
  // (SESSION_STARTED), decidido adiante com o relógio do banco, e não um
  // erro genérico de validação da data que ela já tinha.
  if (input.startsAt !== undefined) {
    ensureFuture(input.startsAt)
  }

  // A chamada externa fica fora da transação para não segurar locks enquanto
  // a TMDb responde.
  const movie =
    input.tmdbMovieId !== undefined &&
    input.tmdbMovieId !== existingSession.tmdbMovieId
      ? await movieCatalog.getMovieDetails(input.tmdbMovieId)
      : null

  const rebuildsLayout =
    input.rows !== undefined && input.seatsPerRow !== undefined

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

  const result = await prisma.$transaction(async (transaction) => {
    // Primeiro lock da ordem global. `FOR UPDATE` na Session exclui qualquer
    // reserva concorrente, que adquire `FOR SHARE` antes de ler preço e
    // layout — nenhuma reserva pode nascer sobre estrutura obsoleta.
    const lockedSession = await lockSessionForUpdate(
      transaction,
      id,
      organizerId,
    )

    if (!lockedSession) {
      throw sessionNotFound()
    }

    // Revalidado com os locks já adquiridos: a decisão tomada antes da
    // transação nunca é a autoridade final.
    const editability = await getSessionEditability(
      id,
      lockedSession.status,
      transaction,
    )

    if (!editability.allowed) {
      throw sessionNotEditable(editability)
    }

    if (rebuildsLayout && !editability.layoutEditable) {
      throw sessionLayoutNotEditable()
    }

    // Só depois de provar que a edição é permitida faz sentido cobrar que o
    // resultado continue no futuro.
    ensureFuture(startsAt)

    const updateResult = await transaction.session.updateMany({
      where: { id, organizerId, status: lockedSession.status },
      data: updateData,
    })

    if (updateResult.count !== 1) {
      throw sessionNotEditable(editability)
    }

    if (rebuildsLayout) {
      // Seguro apenas porque `layoutEditable` provou que nenhuma
      // `ReservationSeat` referencia estes assentos: sem órfãos e sem
      // violar a FK RESTRICT.
      await transaction.seat.deleteMany({ where: { sessionId: id } })
      await transaction.seat.createMany({
        data: buildSeats(input.rows!, input.seatsPerRow!).map((seat) => ({
          ...seat,
          sessionId: id,
        })),
      })
    }

    return {
      session: await transaction.session.findUniqueOrThrow({
        where: { id },
        include: sessionWithSeats,
      }),
      editability,
    }
  })

  // Publicado somente após o commit; um rollback não emite nada.
  if (result.session.status === SessionStatus.PUBLISHED) {
    publishSessionChanged(id)

    if (rebuildsLayout) {
      publishSeatsChanged(id)
    }
  }

  return toOrganizerSession(
    result.session,
    result.editability,
    await getSessionMetrics(id),
  )
}

/**
 * Cria um novo DRAFT a partir da estrutura de uma sessão existente.
 *
 * Copia apenas o que descreve a sessão — snapshot do filme, local, sala,
 * endereço, preço e o formato do layout. Nada transacional é copiado: reservas,
 * alocações, pagamentos, ingressos e links compartilhados pertencem à sessão
 * de origem. A cópia nasce `DRAFT`, com `publishedAt` nulo e assentos novos.
 * A TMDb não é consultada de novo: o snapshot local já é a fonte.
 */
export async function duplicateOrganizerSession(
  id: string,
  organizerId: string,
) {
  const source = await findOwnedSession(id, organizerId)
  const rowSizes = new Map<string, number>()

  for (const seat of source.seats) {
    rowSizes.set(seat.rowLabel, (rowSizes.get(seat.rowLabel) ?? 0) + 1)
  }

  const rows = rowSizes.size
  const seatsPerRow =
    rowSizes.size === 0 ? 0 : Math.max(...Array.from(rowSizes.values()))

  const copy = await prisma.$transaction((transaction) =>
    transaction.session.create({
      data: {
        organizerId,
        // Nunca copiado da origem: a cópia sempre nasce como rascunho.
        status: SessionStatus.DRAFT,
        publishedAt: null,
        startsAt: source.startsAt,
        venueName: source.venueName,
        roomName: source.roomName,
        address: source.address,
        priceCents: source.priceCents,
        tmdbMovieId: source.tmdbMovieId,
        movieTitle: source.movieTitle,
        movieOverview: source.movieOverview,
        moviePosterPath: source.moviePosterPath,
        movieBackdropPath: source.movieBackdropPath,
        movieReleaseDate: source.movieReleaseDate,
        movieRuntimeMinutes: source.movieRuntimeMinutes,
        ...(rows > 0 && seatsPerRow > 0
          ? { seats: { createMany: { data: buildSeats(rows, seatsPerRow) } } }
          : {}),
      },
      include: sessionWithSeats,
    }),
  )

  return toOrganizerSession(
    copy,
    { allowed: true, reason: 'DRAFT', layoutEditable: true },
    {
      capacity: copy.seats.length,
      availableSeats: copy.seats.length,
      heldSeats: 0,
      soldSeats: 0,
      occupancyPercentage: 0,
      simulatedRevenueCents: 0,
    },
  )
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

  const [editability, metrics] = await Promise.all([
    getSessionEditability(session.id, session.status),
    getSessionMetrics(session.id),
  ])

  return toOrganizerSession(session, editability, metrics)
}
