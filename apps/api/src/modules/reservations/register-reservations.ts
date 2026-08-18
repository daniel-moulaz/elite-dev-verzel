import type { FastifyInstance } from 'fastify'
import { reservationRoutes } from './reservations.routes.js'

export function registerReservations(app: FastifyInstance) {
  app.register(reservationRoutes, { prefix: '/reservations' })
}
