import type { FastifyInstance } from 'fastify'
import {
  privateSharedTicketRoutes,
  publicSharedTicketRoutes,
} from './shared-tickets.routes.js'

interface RegisterSharedTicketOptions {
  signingSecret: string
  webOrigin: string
}

export function registerSharedTickets(
  app: FastifyInstance,
  options: RegisterSharedTicketOptions,
) {
  app.register(privateSharedTicketRoutes, {
    prefix: '/me/tickets',
    ...options,
  })
  app.register(publicSharedTicketRoutes, {
    prefix: '/shared',
    signingSecret: options.signingSecret,
  })
}
