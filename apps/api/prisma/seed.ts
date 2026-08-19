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
import { DEMO_PASSWORD, DEMO_USERS } from './seed-data.js'

config({
  path: fileURLToPath(new URL('../../../.env', import.meta.url)),
  quiet: true,
})

const DEMO_SESSION_ID = '11111111-1111-4111-8111-111111111111'
const DEMO_TICKET_SESSION_ID = '22222222-2222-4222-8222-222222222222'
const DEMO_RESERVATION_ID = '33333333-3333-4333-8333-333333333333'
const DEMO_PAYMENT_ID = '44444444-4444-4444-8444-444444444444'
const DEMO_TICKET_ID = '55555555-5555-4555-8555-555555555555'

function futureDate(hoursFromNow: number) {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1_000)
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

    const firstSessionStartsAt = futureDate(48)
    const secondSessionStartsAt = futureDate(72)

    await prisma.$transaction(async (transaction) => {
      await transaction.session.upsert({
        where: { id: DEMO_SESSION_ID },
        create: {
          id: DEMO_SESSION_ID,
          organizerId: organizer.id,
          status: SessionStatus.PUBLISHED,
          startsAt: firstSessionStartsAt,
          venueName: 'Cine Verzel',
          roomName: 'Sala Cobre',
          address: 'Avenida Paulista, 1000 — São Paulo, SP',
          priceCents: 3000,
          tmdbMovieId: 157336,
          movieTitle: 'Interestelar',
          movieOverview:
            'Uma equipe atravessa o espaço em busca de um novo lar para a humanidade.',
          moviePosterPath: '/nBNZadXqJSdt05SHLqgT0HuC5Gm.jpg',
          movieBackdropPath: '/xJHokMbljvjADYdit5fK5VQsXEG.jpg',
          movieReleaseDate: new Date('2014-11-05T00:00:00.000Z'),
          movieRuntimeMinutes: 169,
          publishedAt: new Date(),
        },
        update: {
          startsAt: firstSessionStartsAt,
          venueName: 'Cine Verzel',
          roomName: 'Sala Cobre',
          address: 'Avenida Paulista, 1000 — São Paulo, SP',
          priceCents: 3000,
          publishedAt: new Date(),
        },
      })

      await transaction.session.upsert({
        where: { id: DEMO_TICKET_SESSION_ID },
        create: {
          id: DEMO_TICKET_SESSION_ID,
          organizerId: organizer.id,
          status: SessionStatus.PUBLISHED,
          startsAt: secondSessionStartsAt,
          venueName: 'Cine Verzel',
          roomName: 'Sala Marfim',
          address: 'Avenida Paulista, 1000 — São Paulo, SP',
          priceCents: 2600,
          tmdbMovieId: 603,
          movieTitle: 'Matrix',
          movieOverview:
            'Um programador descobre que a realidade ao seu redor esconde um sistema artificial.',
          moviePosterPath: '/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg',
          movieBackdropPath: '/icmmSD4vTTDKOq2vvdulafOGw93.jpg',
          movieReleaseDate: new Date('1999-03-30T00:00:00.000Z'),
          movieRuntimeMinutes: 136,
          publishedAt: new Date(),
        },
        update: {
          startsAt: secondSessionStartsAt,
          venueName: 'Cine Verzel',
          roomName: 'Sala Marfim',
          address: 'Avenida Paulista, 1000 — São Paulo, SP',
          priceCents: 2600,
          publishedAt: new Date(),
        },
      })

      await transaction.seat.createMany({
        data: seatLayout(6, 10).map((seat) => ({
          sessionId: DEMO_SESSION_ID,
          ...seat,
        })),
        skipDuplicates: true,
      })

      await transaction.seat.createMany({
        data: seatLayout(4, 8).map((seat) => ({
          sessionId: DEMO_TICKET_SESSION_ID,
          ...seat,
        })),
        skipDuplicates: true,
      })

      const demoTicketSeat = await transaction.seat.findUniqueOrThrow({
        where: {
          sessionId_label: {
            sessionId: DEMO_TICKET_SESSION_ID,
            label: 'A1',
          },
        },
      })

      await transaction.reservation.upsert({
        where: { id: DEMO_RESERVATION_ID },
        create: {
          id: DEMO_RESERVATION_ID,
          customerId: customerTwo.id,
          sessionId: DEMO_TICKET_SESSION_ID,
          status: ReservationStatus.PAID,
          expiresAt: futureDate(1),
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
          sessionId: DEMO_TICKET_SESSION_ID,
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
      `${usersWithHashes.length} usuários, 2 sessões e 1 ingresso de demonstração preparados.`,
    )
  } finally {
    await prisma.$disconnect()
  }
}

const entryFile = process.argv[1]

if (entryFile && pathToFileURL(resolve(entryFile)).href === import.meta.url) {
  await seed()
}
