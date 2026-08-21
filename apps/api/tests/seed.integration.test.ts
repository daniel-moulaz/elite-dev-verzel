import { afterAll, describe, expect, it } from 'vitest'
import {
  DEMO_DRAFT_SESSION_IDS,
  DEMO_PUBLISHED_SESSION_IDS,
  DEMO_SESSION_IDS,
  DEMO_TICKET_ID,
} from '../prisma/seed-data.js'
import {
  SessionStatus,
  TicketStatus,
} from '../src/generated/prisma/enums.js'
import { prisma } from '../src/lib/prisma.js'

const localDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const localTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

// Intervalo mínimo entre o fim de uma sessão e o início da próxima na mesma
// sala. Sem ele a grade demo pareceria dois filmes rodando ao mesmo tempo.
const ROOM_TURNAROUND_MINUTES = 15

afterAll(async () => {
  await prisma.$disconnect()
})

describe('seed da programação de demonstração', () => {
  it('keeps the evaluator scenario dense, deterministic and operational', async () => {
    const demoIds = Object.values(DEMO_SESSION_IDS)
    const sessions = await prisma.session.findMany({
      where: { id: { in: demoIds } },
      select: {
        id: true,
        status: true,
        startsAt: true,
        venueName: true,
        roomName: true,
        tmdbMovieId: true,
        movieRuntimeMinutes: true,
        publishedAt: true,
        _count: { select: { seats: true } },
      },
    })
    const published = sessions.filter(
      (session) => session.status === SessionStatus.PUBLISHED,
    )
    const draft = sessions.filter(
      (session) => session.status === SessionStatus.DRAFT,
    )

    expect(sessions).toHaveLength(16)
    expect(published).toHaveLength(14)
    expect(draft).toHaveLength(2)
    expect(published.map(({ id }) => id).sort()).toEqual(
      [...DEMO_PUBLISHED_SESSION_IDS].sort(),
    )
    expect(draft.map(({ id }) => id).sort()).toEqual(
      [...DEMO_DRAFT_SESSION_IDS].sort(),
    )
    expect(
      published.every((session) => session.publishedAt !== null),
    ).toBe(true)
    expect(draft.every((session) => session.publishedAt === null)).toBe(true)
    expect(new Set(published.map(({ tmdbMovieId }) => tmdbMovieId)).size).toBe(
      5,
    )
    expect(new Set(published.map(({ venueName }) => venueName)).size).toBe(2)
    expect(
      new Set(published.map(({ roomName }) => roomName)).size,
    ).toBe(4)
    expect(
      new Set(
        published.map(({ startsAt }) => localDateFormatter.format(startsAt)),
      ).size,
    ).toBe(3)

    const expectedSeatCounts = new Map<string, number>([
      [DEMO_SESSION_IDS.interstellarEarly, 60],
      [DEMO_SESSION_IDS.interstellarLate, 60],
      [DEMO_SESSION_IDS.interstellarSecondDay, 60],
      [DEMO_SESSION_IDS.matrixTicket, 32],
      [DEMO_SESSION_IDS.matrixMiddle, 32],
      [DEMO_SESSION_IDS.matrixLate, 32],
      [DEMO_SESSION_IDS.matrixNight, 40],
      [DEMO_SESSION_IDS.godfatherEarly, 40],
      [DEMO_SESSION_IDS.godfatherLate, 40],
      [DEMO_SESSION_IDS.godfatherDraft, 40],
      [DEMO_SESSION_IDS.duneEarly, 40],
      [DEMO_SESSION_IDS.duneSecondDay, 40],
      [DEMO_SESSION_IDS.duneThirdDay, 60],
      [DEMO_SESSION_IDS.cityOfGodMatinee, 32],
      [DEMO_SESSION_IDS.cityOfGodThirdDay, 32],
      [DEMO_SESSION_IDS.cityOfGodDraft, 60],
    ])

    expect(
      sessions.every(
        (session) =>
          session._count.seats === expectedSeatCounts.get(session.id),
      ),
    ).toBe(true)

    const showtimesByMovieAndDate = new Map<string, number>()

    for (const session of published) {
      const key = [
        session.tmdbMovieId,
        localDateFormatter.format(session.startsAt),
      ].join(':')
      showtimesByMovieAndDate.set(
        key,
        (showtimesByMovieAndDate.get(key) ?? 0) + 1,
      )
    }

    const groupedShowtimeCounts = Array.from(showtimesByMovieAndDate.values())
    expect(groupedShowtimeCounts).toContain(3)
    expect(
      groupedShowtimeCounts.filter((count) => count >= 2).length,
    ).toBeGreaterThanOrEqual(3)

    // A grade precisa parecer a de um cinema: horários com minutos variados,
    // não uma sequência de horas cheias.
    const startMinutes = new Set(
      published.map(({ startsAt }) =>
        localTimeFormatter.format(startsAt).slice(-2),
      ),
    )
    expect(startMinutes.size).toBeGreaterThanOrEqual(5)

    // Nenhuma sala exibe dois filmes ao mesmo tempo.
    const sessionsByRoom = new Map<string, typeof sessions>()

    for (const session of sessions) {
      const key = [session.venueName, session.roomName].join(' — ')
      sessionsByRoom.set(key, [...(sessionsByRoom.get(key) ?? []), session])
    }

    for (const roomSessions of sessionsByRoom.values()) {
      const ordered = [...roomSessions].sort(
        (first, second) =>
          first.startsAt.getTime() - second.startsAt.getTime(),
      )
      let roomFreeAt = Number.NEGATIVE_INFINITY

      for (const session of ordered) {
        expect(session.startsAt.getTime()).toBeGreaterThanOrEqual(roomFreeAt)
        roomFreeAt =
          session.startsAt.getTime() +
          ((session.movieRuntimeMinutes ?? 0) + ROOM_TURNAROUND_MINUTES) *
            60_000
      }
    }

    const demoTicket = await prisma.ticket.findUnique({
      where: { id: DEMO_TICKET_ID },
      select: {
        sessionId: true,
        status: true,
        manualCode: true,
        reservationSeat: {
          select: {
            reservationId: true,
            releasedAt: true,
            seat: { select: { label: true } },
          },
        },
      },
    })

    expect(demoTicket).toMatchObject({
      sessionId: DEMO_SESSION_IDS.matrixTicket,
      status: TicketStatus.VALID,
      reservationSeat: {
        releasedAt: null,
        seat: { label: 'A1' },
      },
    })
    expect(demoTicket?.manualCode).toMatch(
      /^[2-9A-HJKMNP-Z]{4}(?:-[2-9A-HJKMNP-Z]{4}){3}$/u,
    )

    // O seed nunca apaga, então o banco local pode acumular dados de E2E
    // manual. O que ele controla — e precisa continuar mínimo — é a própria
    // compra de demonstração: um assento, um pagamento, um ingresso.
    const { reservationSeat } = await prisma.ticket.findUniqueOrThrow({
      where: { id: DEMO_TICKET_ID },
      select: { reservationSeat: { select: { reservationId: true } } },
    })
    const demoReservationId = reservationSeat.reservationId

    expect(
      await prisma.reservationSeat.count({
        where: { reservationId: demoReservationId },
      }),
    ).toBe(1)
    expect(
      await prisma.ticket.count({
        where: { reservationSeat: { reservationId: demoReservationId } },
      }),
    ).toBe(1)
  })
})
