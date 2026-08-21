import { createHash, randomBytes } from 'node:crypto'
import { Prisma } from '../../generated/prisma/client.js'
import { TicketStatus } from '../../generated/prisma/enums.js'
import { HttpError } from '../../http/error-response.js'
import { prisma } from '../../lib/prisma.js'
import {
  getTicketExpirationDate,
} from '../tickets/ticket-crypto.js'
import {
  createTicketQrToken,
  findOwnedTicketWithDetails,
  ticketDetails,
  toTicketResponse,
} from '../tickets/tickets.service.js'

const SHARE_TOKEN_BYTES = 32
const TOKEN_GENERATION_ATTEMPTS = 3

interface LockedShareableTicketRow {
  id: string
  status: TicketStatus
  startsAt: Date
  movieRuntimeMinutes: number | null
}

const sharedTicketDetails = {
  ticket: {
    include: ticketDetails,
  },
} satisfies Prisma.SharedTicketLinkInclude

function sharedTicketNotFound() {
  return new HttpError(
    404,
    'SHARED_TICKET_NOT_FOUND',
    'Ingresso compartilhado não encontrado.',
  )
}

function generateShareToken() {
  return randomBytes(SHARE_TOKEN_BYTES).toString('base64url')
}

export function hashShareToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

function isUniqueConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  )
}

export async function createTicketShareLink(
  ticketId: string,
  ownerId: string,
  webOrigin: string,
) {
  for (let attempt = 0; attempt < TOKEN_GENERATION_ATTEMPTS; attempt += 1) {
    const token = generateShareToken()
    const tokenHash = hashShareToken(token)

    try {
      return await prisma.$transaction(async (transaction) => {
        const [ticket] =
          await transaction.$queryRaw<LockedShareableTicketRow[]>(Prisma.sql`
            /* create-share-link-lock-ticket */
            SELECT
              ticket."id",
              ticket."status",
              session."startsAt",
              session."movieRuntimeMinutes"
            FROM "Ticket" AS ticket
            JOIN "Session" AS session
              ON session."id" = ticket."sessionId"
            WHERE ticket."id" = ${ticketId}::uuid
              AND ticket."ownerId" = ${ownerId}::uuid
            FOR UPDATE OF ticket
          `)

        if (!ticket) {
          throw new HttpError(
            404,
            'TICKET_NOT_FOUND',
            'Ingresso não encontrado.',
          )
        }

        if (ticket.status === TicketStatus.CANCELLED) {
          throw new HttpError(
            409,
            'TICKET_NOT_SHAREABLE',
            'Um ingresso cancelado não pode gerar um novo link.',
          )
        }

        const expiresAt = getTicketExpirationDate(
          ticket.startsAt,
          ticket.movieRuntimeMinutes,
        )

        if (expiresAt.getTime() <= Date.now()) {
          throw new HttpError(
            409,
            'CONFLICT',
            'Este ingresso não pode mais ser compartilhado.',
          )
        }

        await transaction.sharedTicketLink.upsert({
          where: { ticketId: ticket.id },
          create: {
            ticketId: ticket.id,
            tokenHash,
            expiresAt,
          },
          update: {
            tokenHash,
            expiresAt,
            revokedAt: null,
            createdAt: new Date(),
          },
        })

        return {
          url: new URL(`/shared/${token}`, webOrigin).toString(),
          expiresAt,
        }
      })
    } catch (error) {
      if (!isUniqueConflict(error) || attempt === TOKEN_GENERATION_ATTEMPTS - 1) {
        throw error
      }
    }
  }

  throw new Error('Não foi possível gerar o link compartilhável.')
}

export async function revokeTicketShareLink(
  ticketId: string,
  ownerId: string,
) {
  const ticket = await findOwnedTicketWithDetails(ticketId, ownerId)

  await prisma.sharedTicketLink.updateMany({
    where: {
      ticketId: ticket.id,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  })
}

export async function getSharedTicket(token: string, signingSecret: string) {
  const link = await prisma.sharedTicketLink.findUnique({
    where: { tokenHash: hashShareToken(token) },
    include: sharedTicketDetails,
  })

  if (!link) {
    throw sharedTicketNotFound()
  }

  if (link.revokedAt) {
    throw new HttpError(
      410,
      'SHARED_LINK_REVOKED',
      'Este link de ingresso foi revogado.',
    )
  }

  if (link.expiresAt.getTime() <= Date.now()) {
    throw new HttpError(
      410,
      'SHARED_LINK_EXPIRED',
      'Este link de ingresso expirou.',
    )
  }

  return {
    ...toTicketResponse(link.ticket),
    qrToken: createTicketQrToken(link.ticket, signingSecret),
  }
}
