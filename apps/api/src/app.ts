import cors from '@fastify/cors'
import Fastify, { type FastifyServerOptions } from 'fastify'
import { env } from './config/env.js'
import { registerErrorHandler } from './http/error-response.js'
import { registerAuth } from './modules/auth/register-auth.js'
import {
  catalogRoutes,
  createTmdbCatalog,
  type MovieCatalog,
} from './modules/catalog/index.js'
import { registerSessions } from './modules/sessions/register-sessions.js'

interface AppDependencies {
  movieCatalog?: MovieCatalog
}

export function buildApp(
  options: FastifyServerOptions = {},
  dependencies: AppDependencies = {},
) {
  const app = Fastify(options)
  const movieCatalog =
    dependencies.movieCatalog ??
    createTmdbCatalog(
      env.TMDB_READ_ACCESS_TOKEN
        ? { accessToken: env.TMDB_READ_ACCESS_TOKEN }
        : {},
    )

  registerErrorHandler(app)
  app.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: false,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
  registerAuth(app)
  app.register(catalogRoutes, { prefix: '/catalog', catalog: movieCatalog })
  registerSessions(app, movieCatalog)

  app.get('/health', async () => ({ status: 'ok' }))

  return app
}
