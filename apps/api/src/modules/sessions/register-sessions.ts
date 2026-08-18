import type { FastifyInstance } from 'fastify'
import type { MovieCatalog } from '../catalog/catalog.types.js'
import { organizerSessionRoutes } from './sessions.routes.js'

export function registerSessions(
  app: FastifyInstance,
  movieCatalog: MovieCatalog,
) {
  app.register(organizerSessionRoutes, {
    prefix: '/organizer',
    movieCatalog,
  })
}
