import Fastify from 'fastify'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import {
  ReservationStatus,
  Role,
  SessionStatus,
} from '../src/generated/prisma/enums.js'
import { registerErrorHandler } from '../src/http/error-response.js'
import { prisma } from '../src/lib/prisma.js'
import { registerPublicSessions } from '../src/modules/public-sessions/register-public-sessions.js'

const TEST_ADDRESS = 'Rua Catálogo Público M3, 100'
const createdSessionIds = new Set<string>()
const app = Fastify()
let organizerId: string
let customerId: string

interface PublicSessionSummary {
  id: string
  startsAt: string
  venueName: string
  roomName: string
  priceCents: number
  movie: {
    title: string
    posterPath: string | null
    releaseDate: string | null
  }
  capacity: number
}

interface PublicSessionDetail extends PublicSessionSummary {
  address: string
  movie: PublicSessionSummary['movie'] & {
    tmdbId: number
    overview: string
    backdropPath: string | null
    runtimeMinutes: number | null
  }
}

interface PublicSeat {
  id: string
  label: string
  rowLabel: string
  number: number
  status: 'AVAILABLE' | 'HELD' | 'SOLD'
}

function assertLocalTestDatabase() {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '')
  const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

  if (
    process.env.NODE_ENV !== 'test' ||
    !localHosts.has(databaseUrl.hostname)
  ) {
    throw new Error(
      'Os testes de catálogo público exigem um PostgreSQL local identificado como teste.',
    )
  }
}

function futureDate(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1_000)
}

async function createTestSession({
  status = SessionStatus.PUBLISHED,
  startsAt = futureDate(24),
  title = 'Filme de Teste M3',
  venueName = 'Cinema Público M3',
  seatCount = 3,
}: {
  status?: SessionStatus
  startsAt?: Date
  title?: string
  venueName?: string
  seatCount?: number
} = {}) {
  const session = await prisma.session.create({
    data: {
      organizerId,
      status,
      startsAt,
      venueName,
      roomName: 'Sala M3',
      address: TEST_ADDRESS,
      priceCents: 2_500,
      tmdbMovieId: 99_001,
      movieTitle: title,
      movieOverview: 'Sinopse usada somente pelos testes públicos do M3.',
      moviePosterPath: '/poster-m3.jpg',
      movieBackdropPath: '/backdrop-m3.jpg',
      movieReleaseDate: new Date('2024-05-10T00:00:00.000Z'),
      movieRuntimeMinutes: 112,
      publishedAt:
        status === SessionStatus.PUBLISHED ? new Date() : null,
      seats: {
        create: Array.from({ length: seatCount }, (_, index) => ({
          rowLabel: 'A',
          number: index + 1,
          label: `A${index + 1}`,
        })),
      },
    },
    include: { seats: { orderBy: { number: 'asc' } } },
  })

  createdSessionIds.add(session.id)
  return session
}

async function removeCreatedSessions() {
  if (createdSessionIds.size === 0) {
    return
  }

  await prisma.reservation.deleteMany({
    where: { sessionId: { in: Array.from(createdSessionIds) } },
  })
  await prisma.session.deleteMany({
    where: { id: { in: Array.from(createdSessionIds) } },
  })
  createdSessionIds.clear()
}

beforeAll(async () => {
  assertLocalTestDatabase()
  registerErrorHandler(app)
  registerPublicSessions(app)
  await app.ready()

  const [organizer, customer] = await Promise.all([
    prisma.user.findFirstOrThrow({ where: { role: Role.ORGANIZER } }),
    prisma.user.findFirstOrThrow({ where: { role: Role.CUSTOMER } }),
  ])

  organizerId = organizer.id
  customerId = customer.id
})

beforeEach(removeCreatedSessions)

afterAll(async () => {
  try {
    await removeCreatedSessions()
  } finally {
    await app.close()
    await prisma.$disconnect()
  }
})

describe('GET /sessions', () => {
  it('returns only future PUBLISHED sessions, ordered by start time', async () => {
    const later = await createTestSession({
      startsAt: futureDate(48),
      title: 'Sessão Posterior',
    })
    const sooner = await createTestSession({
      startsAt: futureDate(12),
      title: 'Sessão Próxima',
    })
    await createTestSession({
      status: SessionStatus.DRAFT,
      startsAt: futureDate(6),
      title: 'Rascunho Oculto',
    })
    await createTestSession({
      startsAt: futureDate(-6),
      title: 'Sessão Encerrada',
    })

    const response = await app.inject({ method: 'GET', url: '/sessions' })

    expect(response.statusCode).toBe(200)
    const sessions = response.json<{
      sessions: PublicSessionSummary[]
    }>().sessions
    const testSessions = sessions.filter(({ id }) =>
      createdSessionIds.has(id),
    )

    expect(testSessions.map(({ id }) => id)).toEqual([sooner.id, later.id])
    expect(testSessions[0]).toMatchObject({
      venueName: 'Cinema Público M3',
      roomName: 'Sala M3',
      priceCents: 2_500,
      capacity: 3,
      movie: {
        title: 'Sessão Próxima',
        posterPath: '/poster-m3.jpg',
        releaseDate: '2024-05-10',
      },
    })
    expect(testSessions[0]).not.toHaveProperty('organizerId')
    expect(testSessions[0]).not.toHaveProperty('address')
  })

  it('searches movie title and venue name case-insensitively', async () => {
    const titleMatch = await createTestSession({
      title: 'MarcadorM3 Busca Única no Título',
    })
    const venueMatch = await createTestSession({
      title: 'Outro Filme',
      venueName: 'Cine MarcadorM3 Busca Única',
    })
    await createTestSession({ title: 'Sem Correspondência' })

    const response = await app.inject({
      method: 'GET',
      url: '/sessions?q=MARCADORM3',
    })

    expect(response.statusCode).toBe(200)
    const ids = response
      .json<{ sessions: PublicSessionSummary[] }>()
      .sessions.map(({ id }) => id)

    expect(ids).toEqual(expect.arrayContaining([titleMatch.id, venueMatch.id]))
    expect(ids).toHaveLength(2)
  })

  it('rejects an empty explicit search query', async () => {
    const response = await app.inject({ method: 'GET', url: '/sessions?q=' })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      error: 'VALIDATION_ERROR',
      message: 'Informe uma busca válida.',
    })
  })
})

describe('GET /sessions/:id', () => {
  it('returns the public snapshot and capacity without organizer data', async () => {
    const session = await createTestSession({ seatCount: 4 })

    const response = await app.inject({
      method: 'GET',
      url: `/sessions/${session.id}`,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json<PublicSessionDetail>()).toMatchObject({
      id: session.id,
      address: TEST_ADDRESS,
      priceCents: 2_500,
      capacity: 4,
      movie: {
        tmdbId: 99_001,
        title: 'Filme de Teste M3',
        overview: 'Sinopse usada somente pelos testes públicos do M3.',
        backdropPath: '/backdrop-m3.jpg',
        runtimeMinutes: 112,
      },
    })
    expect(response.json()).not.toHaveProperty('organizerId')
  })

  it.each([
    ['DRAFT', SessionStatus.DRAFT, futureDate(24)],
    ['past', SessionStatus.PUBLISHED, futureDate(-1)],
  ])('hides a %s session', async (_label, status, startsAt) => {
    const session = await createTestSession({ status, startsAt })

    const response = await app.inject({
      method: 'GET',
      url: `/sessions/${session.id}`,
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      error: 'SESSION_NOT_FOUND',
      message: 'Sessão não encontrada.',
    })
  })
})

describe('GET /sessions/:id/seats', () => {
  it('derives valid holds as HELD and expired holds as AVAILABLE', async () => {
    const session = await createTestSession()
    const [heldSeat, expiredSeat] = session.seats

    if (!heldSeat || !expiredSeat || !session.seats[2]) {
      throw new Error('O layout de teste deveria conter três assentos.')
    }

    await prisma.reservation.create({
      data: {
        customerId,
        sessionId: session.id,
        status: ReservationStatus.PENDING,
        expiresAt: futureDate(1),
        totalCents: session.priceCents,
        seats: {
          create: {
            seatId: heldSeat.id,
            unitPriceCents: session.priceCents,
          },
        },
      },
    })
    const expiredReservation = await prisma.reservation.create({
      data: {
        customerId,
        sessionId: session.id,
        status: ReservationStatus.PENDING,
        expiresAt: futureDate(1),
        totalCents: session.priceCents,
        seats: {
          create: {
            seatId: expiredSeat.id,
            unitPriceCents: session.priceCents,
          },
        },
      },
    })
    await prisma.$executeRaw`
      UPDATE "Reservation"
      SET "expiresAt" = clock_timestamp()
      WHERE "id" = ${expiredReservation.id}::uuid
    `

    const response = await app.inject({
      method: 'GET',
      url: `/sessions/${session.id}/seats`,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json<{ sessionId: string; seats: PublicSeat[] }>()).toEqual({
      sessionId: session.id,
      seats: [
        {
          id: heldSeat.id,
          label: 'A1',
          rowLabel: 'A',
          number: 1,
          status: 'HELD',
        },
        {
          id: expiredSeat.id,
          label: 'A2',
          rowLabel: 'A',
          number: 2,
          status: 'AVAILABLE',
        },
        {
          id: session.seats[2].id,
          label: 'A3',
          rowLabel: 'A',
          number: 3,
          status: 'AVAILABLE',
        },
      ],
    })
  })

  it('does not expose a seat map for a DRAFT session', async () => {
    const session = await createTestSession({ status: SessionStatus.DRAFT })

    const response = await app.inject({
      method: 'GET',
      url: `/sessions/${session.id}/seats`,
    })

    expect(response.statusCode).toBe(404)
  })
})
