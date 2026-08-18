import type { FastifyInstance } from 'fastify'
import { ticketRoutes, type TicketRoutesOptions } from './tickets.routes.js'

export function registerTickets(
  app: FastifyInstance,
  options: TicketRoutesOptions,
) {
  app.register(ticketRoutes, { prefix: '/me/tickets', ...options })
}
