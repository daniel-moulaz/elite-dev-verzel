import type { FastifyPluginAsync } from 'fastify'
import { Role } from '../../generated/prisma/enums.js'
import { HttpError } from '../../http/error-response.js'
import type { MovieCatalog } from '../catalog/catalog.types.js'
import {
  createSessionBodySchema,
  sessionParamsSchema,
  updateSessionBodySchema,
} from './sessions.schemas.js'
import {
  createOrganizerSession,
  getOrganizerSession,
  listOrganizerSessions,
  publishOrganizerSession,
  updateOrganizerSession,
} from './sessions.service.js'

interface OrganizerSessionRoutesOptions {
  movieCatalog: MovieCatalog
}

function invalidRequest(message = 'A requisição contém dados inválidos.') {
  return new HttpError(400, 'VALIDATION_ERROR', message)
}

export const organizerSessionRoutes: FastifyPluginAsync<
  OrganizerSessionRoutesOptions
> = async (app, options) => {
  const organizerOnly = [
    app.authenticate,
    app.authorizeRoles(Role.ORGANIZER),
  ]

  app.post(
    '/sessions',
    { preHandler: organizerOnly },
    async (request, reply) => {
      const body = createSessionBodySchema.safeParse(request.body)

      if (!body.success) {
        throw invalidRequest()
      }

      const organizerId = request.authUser?.id

      if (!organizerId) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.')
      }

      const session = await createOrganizerSession(
        organizerId,
        body.data,
        options.movieCatalog,
      )

      return reply.code(201).send(session)
    },
  )

  app.get(
    '/sessions',
    { preHandler: organizerOnly },
    async (request) => {
      const organizerId = request.authUser?.id

      if (!organizerId) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.')
      }

      return { sessions: await listOrganizerSessions(organizerId) }
    },
  )

  app.get(
    '/sessions/:id',
    { preHandler: organizerOnly },
    async (request) => {
      const params = sessionParamsSchema.safeParse(request.params)

      if (!params.success) {
        throw invalidRequest('Informe um identificador de sessão válido.')
      }

      const organizerId = request.authUser?.id

      if (!organizerId) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.')
      }

      return getOrganizerSession(params.data.id, organizerId)
    },
  )

  app.patch(
    '/sessions/:id',
    { preHandler: organizerOnly },
    async (request) => {
      const params = sessionParamsSchema.safeParse(request.params)
      const body = updateSessionBodySchema.safeParse(request.body)

      if (!params.success || !body.success) {
        throw invalidRequest()
      }

      const organizerId = request.authUser?.id

      if (!organizerId) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.')
      }

      return updateOrganizerSession(
        params.data.id,
        organizerId,
        body.data,
        options.movieCatalog,
      )
    },
  )

  app.post(
    '/sessions/:id/publish',
    { preHandler: organizerOnly },
    async (request) => {
      const params = sessionParamsSchema.safeParse(request.params)

      if (!params.success) {
        throw invalidRequest('Informe um identificador de sessão válido.')
      }

      const organizerId = request.authUser?.id

      if (!organizerId) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.')
      }

      return publishOrganizerSession(params.data.id, organizerId)
    },
  )
}
