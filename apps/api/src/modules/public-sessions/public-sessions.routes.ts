import type { FastifyPluginAsync } from 'fastify'
import { HttpError } from '../../http/error-response.js'
import { apiDocumentation } from '../../openapi/openapi.operations.js'
import {
  listPublicSessionsQuerySchema,
  publicSessionParamsSchema,
} from './public-sessions.schemas.js'
import {
  ensurePublicSession,
  getPublicSession,
  getPublicSessionSeats,
  listPublicSessions,
} from './public-sessions.service.js'
import {
  SessionStreamRegistry,
  startSessionEventStream,
} from './session-stream.js'

function invalidRequest(message = 'A requisição contém dados inválidos.') {
  return new HttpError(400, 'VALIDATION_ERROR', message)
}

export const publicSessionRoutes: FastifyPluginAsync = async (app) => {
  const streamRegistry = new SessionStreamRegistry()

  // `preClose` roda antes do fechamento do servidor HTTP; `onClose` só roda
  // depois que as requisições em voo terminam, e um stream SSE nunca termina
  // sozinho — usá-lo deixaria `app.close()` preso.
  app.addHook('preClose', async () => {
    streamRegistry.closeAll()
  })

  app.get(
    '/',
    { config: { swaggerTransform: apiDocumentation.sessions.list } },
    async (request) => {
      const query = listPublicSessionsQuerySchema.safeParse(request.query)

      if (!query.success) {
        throw invalidRequest('Informe uma busca válida.')
      }

      return { sessions: await listPublicSessions(query.data.q) }
    },
  )

  app.get(
    '/:id',
    { config: { swaggerTransform: apiDocumentation.sessions.get } },
    async (request) => {
      const params = publicSessionParamsSchema.safeParse(request.params)

      if (!params.success) {
        throw invalidRequest('Informe um identificador de sessão válido.')
      }

      return getPublicSession(params.data.id)
    },
  )

  app.get(
    '/:id/seats',
    { config: { swaggerTransform: apiDocumentation.sessions.seats } },
    async (request) => {
      const params = publicSessionParamsSchema.safeParse(request.params)

      if (!params.success) {
        throw invalidRequest('Informe um identificador de sessão válido.')
      }

      return getPublicSessionSeats(params.data.id)
    },
  )

  app.get(
    '/:id/events',
    { config: { swaggerTransform: apiDocumentation.sessions.events } },
    async (request, reply) => {
      const params = publicSessionParamsSchema.safeParse(request.params)

      if (!params.success) {
        throw invalidRequest('Informe um identificador de sessão válido.')
      }

      // Falha antes de sequestrar a resposta, para que sessão inexistente ou
      // não publicada continue produzindo um 404 JSON normal.
      await ensurePublicSession(params.data.id)

      startSessionEventStream(request, reply, params.data.id, streamRegistry)
    },
  )
}
