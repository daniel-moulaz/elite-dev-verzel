import cors from '@fastify/cors'
import Fastify, { type FastifyServerOptions } from 'fastify'
import { env } from './config/env.js'
import { registerErrorHandler } from './http/error-response.js'
import { registerAuth } from './modules/auth/register-auth.js'

export function buildApp(options: FastifyServerOptions = {}) {
  const app = Fastify(options)

  registerErrorHandler(app)
  app.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
  registerAuth(app)

  app.get('/health', async () => ({ status: 'ok' }))

  return app
}
