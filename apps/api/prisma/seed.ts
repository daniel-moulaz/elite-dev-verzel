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
const DEMO_TICKET_PRICE_CENTS = 2600

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
  dune: {
    tmdbMovieId: 693134,
    movieTitle: 'Duna: Parte Dois',
    movieOverview:
      'Paul Atreides se une aos Fremen para vingar sua família e enfrentar o destino que viu em visões.',
    moviePosterPath: '/8LJJjLjAzAwXS40S5mx79PJ2jSs.jpg',
    movieBackdropPath: '/eZ239CUp1d6OryZEBPnO2n87gMG.jpg',
    movieReleaseDate: new Date('2024-02-27T00:00:00.000Z'),
    movieRuntimeMinutes: 166,
  },
  cityOfGod: {
    tmdbMovieId: 598,
    movieTitle: 'Cidade de Deus',
    movieOverview:
      'Buscapé cresce cercado pela violência e enxerga na fotografia a sua saída da Cidade de Deus.',
    moviePosterPath: '/gfnXixcGC060QcG6JPxN6AMdVsq.jpg',
    movieBackdropPath: '/uvitbjFU4JqvMwIkMWHp69bmUzG.jpg',
    movieReleaseDate: new Date('2002-08-30T00:00:00.000Z'),
    movieRuntimeMinutes: 130,
  },
} as const

// Cada sala tem local, endereço e layout fixos. Repetir a sala em vários
// horários mantém a grade plausível sem redeclarar esses dados por sessão.
const demoRooms = {
  marfim: {
    venueName: 'SEPTEM Paulista',
    address: 'Avenida Paulista, 1000 — São Paulo, SP',
    roomName: 'Sala Marfim',
    rows: 4,
    seatsPerRow: 8,
  },
  cobre: {
    venueName: 'SEPTEM Paulista',
    address: 'Avenida Paulista, 1000 — São Paulo, SP',
    roomName: 'Sala Cobre',
    rows: 6,
    seatsPerRow: 10,
  },
  rubi: {
    venueName: 'SEPTEM Pinheiros',
    address: 'Rua dos Pinheiros, 1000 — São Paulo, SP',
    roomName: 'Sala Rubi',
    rows: 5,
    seatsPerRow: 8,
  },
  horizonte: {
    venueName: 'SEPTEM Pinheiros',
    address: 'Rua dos Pinheiros, 1000 — São Paulo, SP',
    roomName: 'Sala Horizonte',
    rows: 5,
    seatsPerRow: 8,
  },
} as const

// Programação demo: três dias de exibição, cinco filmes, dois cinemas e quatro
// salas. Os horários seguem uma grade real de cinema, e cada sala respeita a
// duração do filme entre uma sessão e a seguinte. Somente a sessão de Matrix
// das 15:40 carrega histórico comercial; as demais nascem limpas e editáveis.
const demoSessions = [
  {
    id: DEMO_SESSION_IDS.matrixTicket,
    status: SessionStatus.PUBLISHED,
    dayOffset: 2,
    localTime: '15:40',
    room: demoRooms.marfim,
    priceCents: DEMO_TICKET_PRICE_CENTS,
    movie: movieSnapshots.matrix,
  },
  {
    id: DEMO_SESSION_IDS.interstellarEarly,
    status: SessionStatus.PUBLISHED,
    dayOffset: 2,
    localTime: '16:20',
    room: demoRooms.cobre,
    priceCents: 3000,
    movie: movieSnapshots.interstellar,
  },
  {
    id: DEMO_SESSION_IDS.matrixMiddle,
    status: SessionStatus.PUBLISHED,
    dayOffset: 2,
    localTime: '18:40',
    room: demoRooms.marfim,
    priceCents: 2800,
    movie: movieSnapshots.matrix,
  },
  {
    id: DEMO_SESSION_IDS.duneEarly,
    status: SessionStatus.PUBLISHED,
    dayOffset: 2,
    localTime: '18:50',
    room: demoRooms.rubi,
    priceCents: 3200,
    movie: movieSnapshots.dune,
  },
  {
    id: DEMO_SESSION_IDS.interstellarLate,
    status: SessionStatus.PUBLISHED,
    dayOffset: 2,
    localTime: '19:40',
    room: demoRooms.cobre,
    priceCents: 3200,
    movie: movieSnapshots.interstellar,
  },
  {
    id: DEMO_SESSION_IDS.matrixLate,
    status: SessionStatus.PUBLISHED,
    dayOffset: 2,
    localTime: '21:20',
    room: demoRooms.marfim,
    priceCents: 2800,
    movie: movieSnapshots.matrix,
  },
  {
    id: DEMO_SESSION_IDS.cityOfGodMatinee,
    status: SessionStatus.PUBLISHED,
    dayOffset: 3,
    localTime: '13:40',
    room: demoRooms.marfim,
    priceCents: 2200,
    movie: movieSnapshots.cityOfGod,
  },
  {
    id: DEMO_SESSION_IDS.godfatherEarly,
    status: SessionStatus.PUBLISHED,
    dayOffset: 3,
    localTime: '16:50',
    room: demoRooms.rubi,
    priceCents: 2900,
    movie: movieSnapshots.godfather,
  },
  {
    id: DEMO_SESSION_IDS.interstellarSecondDay,
    status: SessionStatus.PUBLISHED,
    dayOffset: 3,
    localTime: '18:15',
    room: demoRooms.cobre,
    priceCents: 3000,
    movie: movieSnapshots.interstellar,
  },
  {
    id: DEMO_SESSION_IDS.duneSecondDay,
    status: SessionStatus.PUBLISHED,
    dayOffset: 3,
    localTime: '19:20',
    room: demoRooms.horizonte,
    priceCents: 3100,
    movie: movieSnapshots.dune,
  },
  {
    id: DEMO_SESSION_IDS.godfatherLate,
    status: SessionStatus.PUBLISHED,
    dayOffset: 3,
    localTime: '20:15',
    room: demoRooms.rubi,
    priceCents: 3100,
    movie: movieSnapshots.godfather,
  },
  {
    id: DEMO_SESSION_IDS.cityOfGodThirdDay,
    status: SessionStatus.PUBLISHED,
    dayOffset: 4,
    localTime: '16:30',
    room: demoRooms.marfim,
    priceCents: 2400,
    movie: movieSnapshots.cityOfGod,
  },
  {
    id: DEMO_SESSION_IDS.duneThirdDay,
    status: SessionStatus.PUBLISHED,
    dayOffset: 4,
    localTime: '21:05',
    room: demoRooms.cobre,
    priceCents: 3300,
    movie: movieSnapshots.dune,
  },
  {
    id: DEMO_SESSION_IDS.matrixNight,
    status: SessionStatus.PUBLISHED,
    dayOffset: 4,
    localTime: '22:40',
    room: demoRooms.rubi,
    priceCents: 2500,
    movie: movieSnapshots.matrix,
  },
  {
    id: DEMO_SESSION_IDS.godfatherDraft,
    status: SessionStatus.DRAFT,
    dayOffset: 4,
    localTime: '14:10',
    room: demoRooms.horizonte,
    priceCents: 2700,
    movie: movieSnapshots.godfather,
  },
  {
    id: DEMO_SESSION_IDS.cityOfGodDraft,
    status: SessionStatus.DRAFT,
    dayOffset: 5,
    localTime: '20:35',
    room: demoRooms.cobre,
    priceCents: 2800,
    movie: movieSnapshots.cityOfGod,
  },
] as const

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

    await prisma.$transaction(async (transaction) => {
      for (const demoSession of demoSessions) {
        const sessionData = {
          organizerId: organizer.id,
          status: demoSession.status,
          startsAt: demoStartsAt(
            seedNow,
            demoSession.dayOffset,
            demoSession.localTime,
          ),
          venueName: demoSession.room.venueName,
          roomName: demoSession.room.roomName,
          address: demoSession.room.address,
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
            demoSession.room.rows,
            demoSession.room.seatsPerRow,
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
          totalCents: DEMO_TICKET_PRICE_CENTS,
        },
        update: {
          totalCents: DEMO_TICKET_PRICE_CENTS,
        },
      })

      const existingReservationSeat =
        await transaction.reservationSeat.findUnique({
          where: {
            reservationId_seatId: {
              reservationId: DEMO_RESERVATION_ID,
              seatId: demoTicketSeat.id,
            },
          },
        })
      const reservationSeat = existingReservationSeat
        ? await transaction.reservationSeat.update({
            where: { id: existingReservationSeat.id },
            data: { unitPriceCents: DEMO_TICKET_PRICE_CENTS },
          })
        : await transaction.reservationSeat.create({
            data: {
              reservationId: DEMO_RESERVATION_ID,
              seatId: demoTicketSeat.id,
              unitPriceCents: DEMO_TICKET_PRICE_CENTS,
            },
          })

      if (reservationSeat.releasedAt === null) {
        await transaction.reservation.update({
          where: { id: DEMO_RESERVATION_ID },
          data: { status: ReservationStatus.PAID },
        })
      }

      await transaction.payment.upsert({
        where: { reservationId: DEMO_RESERVATION_ID },
        create: {
          id: DEMO_PAYMENT_ID,
          reservationId: DEMO_RESERVATION_ID,
          status: PaymentStatus.APPROVED,
          amountCents: DEMO_TICKET_PRICE_CENTS,
        },
        update: {
          status: PaymentStatus.APPROVED,
          amountCents: DEMO_TICKET_PRICE_CENTS,
        },
      })

      if (reservationSeat.releasedAt === null) {
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
      }
    })

    const publishedCount = demoSessions.filter(
      ({ status }) => status === SessionStatus.PUBLISHED,
    ).length

    console.log(
      `${usersWithHashes.length} usuários, ${publishedCount} sessões publicadas, ${demoSessions.length - publishedCount} rascunhos e 1 ingresso de demonstração preparados.`,
    )
  } finally {
    await prisma.$disconnect()
  }
}

const entryFile = process.argv[1]

if (entryFile && pathToFileURL(resolve(entryFile)).href === import.meta.url) {
  await seed()
}
