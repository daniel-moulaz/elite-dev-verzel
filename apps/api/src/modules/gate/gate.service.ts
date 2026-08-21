import { Prisma } from '../../generated/prisma/client.js'
import {
  SessionStatus,
  TicketStatus,
} from '../../generated/prisma/enums.js'
import { HttpError } from '../../http/error-response.js'
import { prisma } from '../../lib/prisma.js'
import { verifyTicketToken } from '../tickets/ticket-crypto.js'

const gateSessionSelect = {
  id: true,
  startsAt: true,
  venueName: true,
  roomName: true,
  movieTitle: true,
  moviePosterPath: true,
} satisfies Prisma.SessionSelect

const gateTicketSelect = {
  id: true,
  sessionId: true,
  status: true,
  usedAt: true,
  session: {
    select: {
      id: true,
      startsAt: true,
      venueName: true,
      roomName: true,
      movieTitle: true,
    },
  },
  reservationSeat: {
    select: {
      seat: {
        select: { label: true },
      },
    },
  },
} satisfies Prisma.TicketSelect

type GateTicket = Prisma.TicketGetPayload<{
  select: typeof gateTicketSelect
}>

interface ConsumedTicketRow {
  id: string
  usedAt: Date
  usedByGateId: string
}

const compactManualCodePattern = /^[2-9A-HJKMNP-Z]{16}$/u
const groupedManualCodePattern =
  /^[2-9A-HJKMNP-Z]{4}(?:[- ][2-9A-HJKMNP-Z]{4}){3}$/u

export function normalizeManualCode(credential: string) {
  const normalizedInput = credential.trim().toUpperCase()

  if (
    !compactManualCodePattern.test(normalizedInput) &&
    !groupedManualCodePattern.test(normalizedInput)
  ) {
    return null
  }

  const compactCode = normalizedInput.replace(/[- ]/gu, '')

  return compactCode.match(/.{4}/gu)!.join('-')
}

function toGateSession(
  session: Prisma.SessionGetPayload<{ select: typeof gateSessionSelect }>,
) {
  return {
    id: session.id,
    startsAt: session.startsAt,
    venueName: session.venueName,
    roomName: session.roomName,
    movie: {
      title: session.movieTitle,
      posterPath: session.moviePosterPath,
    },
  }
}

function toConsumedTicket(ticket: GateTicket) {
  return {
    seat: { label: ticket.reservationSeat.seat.label },
    session: {
      id: ticket.session.id,
      startsAt: ticket.session.startsAt,
      venueName: ticket.session.venueName,
      roomName: ticket.session.roomName,
      movie: { title: ticket.session.movieTitle },
    },
  }
}

async function resolveCredential(
  credential: string,
  signingSecret: string,
): Promise<GateTicket | null> {
  const manualCode = normalizeManualCode(credential)

  if (manualCode) {
    return prisma.ticket.findUnique({
      where: { manualCode },
      select: gateTicketSelect,
    })
  }

  let claims: ReturnType<typeof verifyTicketToken>

  try {
    claims = verifyTicketToken(credential.trim(), {
      secret: signingSecret,
    })
  } catch {
    return null
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: claims.jti },
    select: gateTicketSelect,
  })

  if (!ticket || ticket.sessionId !== claims.sid) {
    return null
  }

  return ticket
}

async function ensurePublishedGateSession(sessionId: string) {
  const session = await prisma.session.findFirst({
    where: { id: sessionId, status: SessionStatus.PUBLISHED },
    select: { id: true },
  })

  if (!session) {
    throw new HttpError(
      404,
      'SESSION_NOT_FOUND',
      'Sessão não encontrada.',
    )
  }
}

export async function listGateSessions() {
  const sessions = await prisma.session.findMany({
    where: { status: SessionStatus.PUBLISHED },
    select: gateSessionSelect,
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
  })

  return { sessions: sessions.map(toGateSession) }
}

export async function consumeGateTicket(
  sessionId: string,
  credential: string,
  gateId: string,
  signingSecret: string,
) {
  const ticket = await resolveCredential(credential, signingSecret)

  if (!ticket) {
    return { result: 'INVALID' as const }
  }

  await ensurePublishedGateSession(sessionId)

  if (ticket.status === TicketStatus.CANCELLED) {
    return { result: 'INVALID' as const }
  }

  if (ticket.sessionId !== sessionId) {
    return { result: 'WRONG_EVENT' as const }
  }

  if (ticket.status === TicketStatus.USED) {
    return {
      result: 'ALREADY_USED' as const,
      usedAt: ticket.usedAt,
    }
  }

  const consumed = await prisma.$queryRaw<ConsumedTicketRow[]>`
    /* gate-consume-ticket */
    UPDATE "Ticket"
    SET
      "status" = 'USED',
      "usedAt" = clock_timestamp(),
      "usedByGateId" = ${gateId}::uuid
    WHERE "id" = ${ticket.id}::uuid
      AND "sessionId" = ${sessionId}::uuid
      AND "status" = 'VALID'
    RETURNING "id", "usedAt", "usedByGateId"
  `

  if (consumed.length === 1) {
    return {
      result: 'VALID' as const,
      usedAt: consumed[0]!.usedAt,
      ticket: toConsumedTicket(ticket),
    }
  }

  const currentTicket = await prisma.ticket.findUnique({
    where: { id: ticket.id },
    select: gateTicketSelect,
  })

  if (!currentTicket) {
    return { result: 'INVALID' as const }
  }

  if (currentTicket.status === TicketStatus.CANCELLED) {
    return { result: 'INVALID' as const }
  }

  if (currentTicket.sessionId !== sessionId) {
    return { result: 'WRONG_EVENT' as const }
  }

  if (currentTicket.status === TicketStatus.USED) {
    return {
      result: 'ALREADY_USED' as const,
      usedAt: currentTicket.usedAt,
    }
  }

  throw new Error('O ingresso permaneceu válido após uma tentativa de consumo.')
}
