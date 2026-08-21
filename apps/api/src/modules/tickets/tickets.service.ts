import { Prisma } from '../../generated/prisma/client.js'
import {
  ReservationStatus,
  TicketStatus,
} from '../../generated/prisma/enums.js'
import { HttpError } from '../../http/error-response.js'
import { prisma } from '../../lib/prisma.js'
import { signTicketToken } from './ticket-crypto.js'

export const ticketDetails = {
  session: {
    select: {
      id: true,
      startsAt: true,
      venueName: true,
      roomName: true,
      address: true,
      movieTitle: true,
      movieOverview: true,
      moviePosterPath: true,
      movieBackdropPath: true,
      movieRuntimeMinutes: true,
    },
  },
  reservationSeat: {
    select: {
      seat: {
        select: {
          id: true,
          label: true,
          rowLabel: true,
          number: true,
        },
      },
      reservation: {
        select: {
          id: true,
          status: true,
          seats: {
            select: {
              ticket: {
                select: { status: true },
              },
            },
          },
        },
      },
    },
  },
  sharedLink: {
    select: {
      expiresAt: true,
      revokedAt: true,
    },
  },
} satisfies Prisma.TicketInclude

export type TicketWithDetails = Prisma.TicketGetPayload<{
  include: typeof ticketDetails
}>

function ticketNotFound() {
  return new HttpError(404, 'TICKET_NOT_FOUND', 'Ingresso não encontrado.')
}

export function toTicketResponse(ticket: TicketWithDetails) {
  return {
    id: ticket.id,
    status: ticket.status,
    manualCode:
      ticket.status === TicketStatus.CANCELLED ? null : ticket.manualCode,
    issuedAt: ticket.issuedAt,
    session: {
      id: ticket.session.id,
      movie: {
        title: ticket.session.movieTitle,
        overview: ticket.session.movieOverview,
        posterPath: ticket.session.moviePosterPath,
        backdropPath: ticket.session.movieBackdropPath,
      },
      startsAt: ticket.session.startsAt,
      venueName: ticket.session.venueName,
      roomName: ticket.session.roomName,
      address: ticket.session.address,
    },
    seat: ticket.reservationSeat.seat,
  }
}

function toOwnedTicketResponse(ticket: TicketWithDetails) {
  const reservation = ticket.reservationSeat.reservation
  const reservationTickets = reservation.seats.flatMap(({ ticket }) =>
    ticket ? [ticket] : [],
  )
  const isFutureSession = ticket.session.startsAt.getTime() > Date.now()
  const isReservationPaid = reservation.status === ReservationStatus.PAID

  return {
    ...toTicketResponse(ticket),
    canCancel:
      ticket.status === TicketStatus.VALID &&
      isReservationPaid &&
      isFutureSession,
    reservation: {
      id: reservation.id,
      status: reservation.status,
      ticketCount: reservationTickets.length,
      canCancel:
        isReservationPaid &&
        isFutureSession &&
        reservationTickets.some(({ status }) => status === TicketStatus.VALID) &&
        reservationTickets.every(({ status }) => status !== TicketStatus.USED),
    },
  }
}

export function createTicketQrToken(
  ticket: TicketWithDetails,
  signingSecret: string,
) {
  if (ticket.status === TicketStatus.CANCELLED) {
    return null
  }

  return signTicketToken({
    ticketId: ticket.id,
    sessionId: ticket.session.id,
    issuedAt: ticket.issuedAt,
    sessionStartsAt: ticket.session.startsAt,
    movieRuntimeMinutes: ticket.session.movieRuntimeMinutes,
    secret: signingSecret,
  })
}

export async function listCustomerTickets(ownerId: string) {
  const tickets = await prisma.ticket.findMany({
    where: { ownerId },
    include: ticketDetails,
    orderBy: [
      { session: { startsAt: 'asc' } },
      { issuedAt: 'asc' },
    ],
  })

  return {
    tickets: tickets.map(toOwnedTicketResponse),
  }
}

export async function findOwnedTicketWithDetails(
  ticketId: string,
  ownerId: string,
) {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, ownerId },
    include: ticketDetails,
  })

  if (!ticket) {
    throw ticketNotFound()
  }

  return ticket
}

export async function getCustomerTicket(
  ticketId: string,
  ownerId: string,
  signingSecret: string,
) {
  const ticket = await findOwnedTicketWithDetails(ticketId, ownerId)

  return {
    ...toOwnedTicketResponse(ticket),
    shareLink:
      ticket.sharedLink &&
      !ticket.sharedLink.revokedAt &&
      ticket.sharedLink.expiresAt.getTime() > Date.now()
        ? { expiresAt: ticket.sharedLink.expiresAt }
        : null,
    qrToken: createTicketQrToken(ticket, signingSecret),
  }
}
