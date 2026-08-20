import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.js'
import {
  PaymentStatus,
  ReservationStatus,
  SessionStatus,
  TicketStatus,
} from '../src/generated/prisma/enums.js'
import { generateManualCode } from '../src/modules/tickets/ticket-crypto.js'
import * as argon2 from 'argon2'
import { config } from 'dotenv'
import {
  DEMO_PASSWORD,
  DEMO_SESSION_IDS,
  DEMO_TICKET_ID,
  DEMO_USERS,
} from './seed-data.js'

config({
  path: fileURLToPath(new URL('../../../.env', import.meta.url)),
  quiet: true,
})

const DEMO_RESERVATION_ID = '33333333-3333-4333-8333-333333333333'
const DEMO_PAYMENT_ID = '44444444-4444-4444-8444-444444444444'

const SAO_PAULO_OFFSET = '-03:00'
const saoPauloCalendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const movieSnapshots = {
  interstellar: {
    tmdbMovieId: 157336,
    movieTitle: 'Interestelar',
    movieOverview:
      'Uma equipe atravessa o espaço em busca de um novo lar para a humanidade.',
    moviePosterPath: '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
    movieBackdropPath: '/xJHokMbljvjADYdit5fK5VQsXEG.jpg',
    movieReleaseDate: new Date('2014-11-05T00:00:00.000Z'),
    movieRuntimeMinutes: 169,
  },
  matrix: {
    tmdbMovieId: 603,
    movieTitle: 'Matrix',
    movieOverview:
      'Um programador descobre que a realidade ao seu redor esconde um sistema artificial.',
    moviePosterPath: '/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg',
    movieBackdropPath: '/icmmSD4vTTDKOq2vvdulafOGw93.jpg',
    movieReleaseDate: new Date('1999-03-30T00:00:00.000Z'),
    movieRuntimeMinutes: 136,
  },
  godfather: {
    tmdbMovieId: 238,
    movieTitle: 'O Poderoso Chefão',
    movieOverview:
      'A família Corleone enfrenta uma disputa de poder que transforma o destino de seu filho mais novo.',
    moviePosterPath: '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',
    movieBackdropPath: '/tmU7GeKVybMWFButWEGl2M4GeiP.jpg',
    movieReleaseDate: new Date('1972-03-24T00:00:00.000Z'),
    movieRuntimeMinutes: 175,
  },
} as const

function saoPauloDatePart(
  value: Date,
  type: Intl.DateTimeFormatPartTypes,
) {
  const part = saoPauloCalendar
    .formatToParts(value)
    .find((candidate) => candidate.type === type)?.value

  if (!part) {
    throw new Error('Não foi possível calcular as datas da programação demo.')
  }

  return Number(part)
}

function demoStartsAt(
  seedNow: Date,
  dayOffset: number,
  localTime: string,
) {
  const calendarDate = new Date(
    Date.UTC(
      saoPauloDatePart(seedNow, 'year'),
      saoPauloDatePart(seedNow, 'month') - 1,
      saoPauloDatePart(seedNow, 'day') + dayOffset,
    ),
  )
  const date = calendarDate.toISOString().slice(0, 10)

  return new Date(`${date}T${localTime}:00${SAO_PAULO_OFFSET}`)
}

function seatLayout(rows: number, seatsPerRow: number) {
  return Array.from({ length: rows }, (_, rowIndex) => {
    const rowLabel = String.fromCharCode(65 + rowIndex)

    return Array.from({ length: seatsPerRow }, (_, seatIndex) => {
      const number = seatIndex + 1

      return { rowLabel, number, label: `${rowLabel}${number}` }
    })
  }).flat()
}

async function seed() {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error('DATABASE_URL é obrigatória para executar o seed.')
  }

  const adapter = new PrismaPg({ connectionString })
  const prisma = new PrismaClient({ adapter })

  try {
    const usersWithHashes = await Promise.all(
      DEMO_USERS.map(async (user) => ({
        ...user,
        email: user.email.trim().toLowerCase(),
        passwordHash: await argon2.hash(DEMO_PASSWORD, {
          type: argon2.argon2id,
        }),
      })),
    )

    const demoUsers = await prisma.$transaction(
      usersWithHashes.map(({ email, name, passwordHash, role }) =>
        prisma.user.upsert({
          where: { email },
          update: { name, passwordHash, role },
          create: { email, name, passwordHash, role },
        }),
      ),
    )

    const organizer = demoUsers.find(
      ({ email }) => email === 'organizer@demo.local',
    )
    const customerTwo = demoUsers.find(
      ({ email }) => email === 'customer2@demo.local',
    )

    if (!organizer || !customerTwo) {
      throw new Error('Não foi possível localizar as contas de demonstração.')
    }

    const seedNow = new Date()
    const publishedAt = seedNow
    const demoSessions = [
      {
        id: DEMO_SESSION_IDS.matrixTicket,
        status: SessionStatus.PUBLISHED,
        startsAt: demoStartsAt(seedNow, 2, '15:30'),
        venueName: 'SEPTEM Paulista',
        roomName: 'Sala Marfim',
        address: 'Avenida Paulista, 1000 — São Paulo, SP',
        priceCents: 2600,
        rows: 4,
        seatsPerRow: 8,
        movie: movieSnapshots.matrix,
      },
      {
        id: DEMO_SESSION_IDS.interstellarEarly,
        status: SessionStatus.PUBLISHED,
        startsAt: demoStartsAt(seedNow, 2, '16:00'),
        venueName: 'SEPTEM Paulista',
        roomName: 'Sala Cobre',
        address: 'Avenida Paulista, 1000 — São Paulo, SP',
        priceCents: 3000,
        rows: 6,
        seatsPerRow: 10,
        movie: movieSnapshots.interstellar,
      },
      {
        id: DEMO_SESSION_IDS.matrixMiddle,
        status: SessionStatus.PUBLISHED,
        startsAt: demoStartsAt(seedNow, 2, '18:30'),
        venueName: 'SEPTEM Paulista',
        roomName: 'Sala Marfim',
        address: 'Avenida Paulista, 1000 — São Paulo, SP',
        priceCents: 2800,
        rows: 4,
        seatsPerRow: 8,
        movie: movieSnapshots.matrix,
      },
      {
        id: DEMO_SESSION_IDS.interstellarLate,
        status: SessionStatus.PUBLISHED,
        startsAt: demoStartsAt(seedNow, 2, '20:00'),
        venueName: 'SEPTEM Paulista',
        roomName: 'Sala Cobre',
        address: 'Avenida Paulista, 1000 — São Paulo, SP',
        priceCents: 3200,
        rows: 6,
        seatsPerRow: 10,
        movie: movieSnapshots.interstellar,
      },
      {
        id: DEMO_SESSION_IDS.matrixLate,
        status: SessionStatus.PUBLISHED,
        startsAt: demoStartsAt(seedNow, 2, '21:30'),
        venueName: 'SEPTEM Paulista',
        roomName: 'Sala Marfim',
        address: 'Avenida Paulista, 1000 — São Paulo, SP',
        priceCents: 2800,
        rows: 4,
        seatsPerRow: 8,
        movie: movieSnapshots.matrix,
      },
      {
        id: DEMO_SESSION_IDS.godfatherEarly,
        status: SessionStatus.PUBLISHED,
        startsAt: demoStartsAt(seedNow, 3, '16:30'),
        venueName: 'SEPTEM Pinheiros',
        roomName: 'Sala Rubi',
        address: 'Rua dos Pinheiros, 1000 — São Paulo, SP',
        priceCents: 2900,
        rows: 5,
        seatsPerRow: 8,
        movie: movieSnapshots.godfather,
      },
      {
        id: DEMO_SESSION_IDS.interstellarSecondDay,
        status: SessionStatus.PUBLISHED,
        startsAt: demoStartsAt(seedNow, 3, '19:30'),
        venueName: 'SEPTEM Paulista',
        roomName: 'Sala Cobre',
        address: 'Avenida Paulista, 1000 — São Paulo, SP',
        priceCents: 3000,
        rows: 6,
        seatsPerRow: 10,
        movie: movieSnapshots.interstellar,
      },
      {
        id: DEMO_SESSION_IDS.godfatherLate,
        status: SessionStatus.PUBLISHED,
        startsAt: demoStartsAt(seedNow, 3, '20:00'),
        venueName: 'SEPTEM Pinheiros',
        roomName: 'Sala Rubi',
        address: 'Rua dos Pinheiros, 1000 — São Paulo, SP',
        priceCents: 3100,
        rows: 5,
        seatsPerRow: 8,
        movie: movieSnapshots.godfather,
      },
      {
        id: DEMO_SESSION_IDS.godfatherDraft,
        status: SessionStatus.DRAFT,
        startsAt: demoStartsAt(seedNow, 3, '14:00'),
        venueName: 'SEPTEM Pinheiros',
        roomName: 'Sala Horizonte',
        address: 'Rua dos Pinheiros, 1000 — São Paulo, SP',
        priceCents: 2700,
        rows: 5,
        seatsPerRow: 8,
        movie: movieSnapshots.godfather,
      },
    ] as const

    await prisma.$transaction(async (transaction) => {
      for (const demoSession of demoSessions) {
        const sessionData = {
          organizerId: organizer.id,
          status: demoSession.status,
          startsAt: demoSession.startsAt,
          venueName: demoSession.venueName,
          roomName: demoSession.roomName,
          address: demoSession.address,
          priceCents: demoSession.priceCents,
          ...demoSession.movie,
          publishedAt:
            demoSession.status === SessionStatus.PUBLISHED
              ? publishedAt
              : null,
        }

        await transaction.session.upsert({
          where: { id: demoSession.id },
          create: { id: demoSession.id, ...sessionData },
          update: sessionData,
        })

        await transaction.seat.createMany({
          data: seatLayout(
            demoSession.rows,
            demoSession.seatsPerRow,
          ).map((seat) => ({
            sessionId: demoSession.id,
            ...seat,
          })),
          skipDuplicates: true,
        })
      }

      const demoTicketSeat = await transaction.seat.findUniqueOrThrow({
        where: {
          sessionId_label: {
            sessionId: DEMO_SESSION_IDS.matrixTicket,
            label: 'A1',
          },
        },
      })

      await transaction.reservation.upsert({
        where: { id: DEMO_RESERVATION_ID },
        create: {
          id: DEMO_RESERVATION_ID,
          customerId: customerTwo.id,
          sessionId: DEMO_SESSION_IDS.matrixTicket,
          status: ReservationStatus.PAID,
          expiresAt: new Date(seedNow.getTime() + 60 * 60 * 1_000),
          totalCents: 2600,
        },
        update: {
          status: ReservationStatus.PAID,
          totalCents: 2600,
        },
      })

      const reservationSeat = await transaction.reservationSeat.upsert({
        where: {
          reservationId_seatId: {
            reservationId: DEMO_RESERVATION_ID,
            seatId: demoTicketSeat.id,
          },
        },
        create: {
          reservationId: DEMO_RESERVATION_ID,
          seatId: demoTicketSeat.id,
          unitPriceCents: 2600,
        },
        update: { unitPriceCents: 2600 },
      })

      await transaction.payment.upsert({
        where: { reservationId: DEMO_RESERVATION_ID },
        create: {
          id: DEMO_PAYMENT_ID,
          reservationId: DEMO_RESERVATION_ID,
          status: PaymentStatus.APPROVED,
          amountCents: 2600,
        },
        update: { status: PaymentStatus.APPROVED, amountCents: 2600 },
      })

      await transaction.ticket.upsert({
        where: { reservationSeatId: reservationSeat.id },
        create: {
          id: DEMO_TICKET_ID,
          reservationSeatId: reservationSeat.id,
          sessionId: DEMO_SESSION_IDS.matrixTicket,
          ownerId: customerTwo.id,
          status: TicketStatus.VALID,
          manualCode: generateManualCode(),
        },
        update: {
          status: TicketStatus.VALID,
          usedAt: null,
          usedByGateId: null,
        },
      })
    })

    console.log(
      `${usersWithHashes.length} usuários, 8 sessões publicadas, 1 rascunho e 1 ingresso de demonstração preparados.`,
    )
  } finally {
    await prisma.$disconnect()
  }
}

const entryFile = process.argv[1]

if (entryFile && pathToFileURL(resolve(entryFile)).href === import.meta.url) {
  await seed()
}
