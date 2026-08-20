import { afterAll, describe, expect, it } from 'vitest'
import {
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
        tmdbMovieId: true,
        _count: { select: { seats: true } },
      },
    })
    const published = sessions.filter(
      (session) => session.status === SessionStatus.PUBLISHED,
    )
    const draft = sessions.filter(
      (session) => session.status === SessionStatus.DRAFT,
    )

    expect(sessions).toHaveLength(9)
    expect(published).toHaveLength(8)
    expect(published.map(({ id }) => id).sort()).toEqual(
      [...DEMO_PUBLISHED_SESSION_IDS].sort(),
    )
    expect(draft).toEqual([
      expect.objectContaining({ id: DEMO_SESSION_IDS.godfatherDraft }),
    ])
    expect(new Set(published.map(({ tmdbMovieId }) => tmdbMovieId)).size).toBe(
      3,
    )
    expect(new Set(published.map(({ venueName }) => venueName)).size).toBe(2)
    expect(
      new Set(
        published.map(({ startsAt }) => localDateFormatter.format(startsAt)),
      ).size,
    ).toBe(2)
    const expectedSeatCounts = new Map<string, number>([
      [DEMO_SESSION_IDS.interstellarEarly, 60],
      [DEMO_SESSION_IDS.interstellarLate, 60],
      [DEMO_SESSION_IDS.interstellarSecondDay, 60],
      [DEMO_SESSION_IDS.matrixTicket, 32],
      [DEMO_SESSION_IDS.matrixMiddle, 32],
      [DEMO_SESSION_IDS.matrixLate, 32],
      [DEMO_SESSION_IDS.godfatherEarly, 40],
      [DEMO_SESSION_IDS.godfatherLate, 40],
      [DEMO_SESSION_IDS.godfatherDraft, 40],
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

    const demoTicket = await prisma.ticket.findUnique({
      where: { id: DEMO_TICKET_ID },
      select: {
        sessionId: true,
        status: true,
        manualCode: true,
        reservationSeat: {
          select: {
            reservationId: true,
            seat: { select: { label: true } },
          },
        },
      },
    })

    expect(demoTicket).toMatchObject({
      sessionId: DEMO_SESSION_IDS.matrixTicket,
      status: TicketStatus.VALID,
      reservationSeat: {
        seat: { label: 'A1' },
      },
    })
    expect(demoTicket?.manualCode).toMatch(
      /^[2-9A-HJKMNP-Z]{4}(?:-[2-9A-HJKMNP-Z]{4}){3}$/u,
    )
  })
})
