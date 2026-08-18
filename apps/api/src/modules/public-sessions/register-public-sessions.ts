import type { FastifyInstance } from 'fastify'
import { publicSessionRoutes } from './public-sessions.routes.js'

export function registerPublicSessions(app: FastifyInstance) {
  app.register(publicSessionRoutes, { prefix: '/sessions' })
}
