import type { FastifyInstance } from 'fastify'
import { paymentRoutes } from './payments.routes.js'

export function registerPayments(app: FastifyInstance) {
  app.register(paymentRoutes, { prefix: '/reservations' })
}
