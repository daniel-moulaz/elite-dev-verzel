import type { FastifyPluginAsync } from 'fastify'
import { HttpError } from '../../http/error-response.js'
import {
  listPublicSessionsQuerySchema,
  publicSessionParamsSchema,
} from './public-sessions.schemas.js'
import {
  getPublicSession,
  getPublicSessionSeats,
  listPublicSessions,
} from './public-sessions.service.js'

function invalidRequest(message = 'A requisição contém dados inválidos.') {
  return new HttpError(400, 'VALIDATION_ERROR', message)
}

export const publicSessionRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (request) => {
    const query = listPublicSessionsQuerySchema.safeParse(request.query)

    if (!query.success) {
      throw invalidRequest('Informe uma busca válida.')
    }

    return { sessions: await listPublicSessions(query.data.q) }
  })

  app.get('/:id', async (request) => {
    const params = publicSessionParamsSchema.safeParse(request.params)

    if (!params.success) {
      throw invalidRequest('Informe um identificador de sessão válido.')
    }

    return getPublicSession(params.data.id)
  })

  app.get('/:id/seats', async (request) => {
    const params = publicSessionParamsSchema.safeParse(request.params)

    if (!params.success) {
      throw invalidRequest('Informe um identificador de sessão válido.')
    }

    return getPublicSessionSeats(params.data.id)
  })
}
