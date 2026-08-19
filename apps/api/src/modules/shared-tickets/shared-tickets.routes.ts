import type { FastifyPluginAsync } from 'fastify'
import { Role } from '../../generated/prisma/enums.js'
import { HttpError } from '../../http/error-response.js'
import { apiDocumentation } from '../../openapi/openapi.operations.js'
import { ticketParamsSchema } from '../tickets/tickets.schemas.js'
import { sharedTicketParamsSchema } from './shared-tickets.schemas.js'
import {
  createTicketShareLink,
  getSharedTicket,
  revokeTicketShareLink,
} from './shared-tickets.service.js'

interface SharedTicketOptions {
  signingSecret: string
  webOrigin: string
}

function customerIdFromRequest(request: {
  authUser: { id: string } | null
}) {
  const customerId = request.authUser?.id

  if (!customerId) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.')
  }

  return customerId
}

export const privateSharedTicketRoutes: FastifyPluginAsync<
  SharedTicketOptions
> = async (app, options) => {
  const customerOnly = [app.authenticate, app.authorizeRoles(Role.CUSTOMER)]

  app.post(
    '/:id/share-link',
    {
      config: { swaggerTransform: apiDocumentation.sharing.create },
      preHandler: customerOnly,
    },
    async (request, reply) => {
      const params = ticketParamsSchema.safeParse(request.params)

      if (!params.success) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          'Informe um identificador de ingresso válido.',
        )
      }

      const shareLink = await createTicketShareLink(
        params.data.id,
        customerIdFromRequest(request),
        options.webOrigin,
      )

      reply.header('Cache-Control', 'no-store')

      return reply.code(201).send(shareLink)
    },
  )

  app.delete(
    '/:id/share-link',
    {
      config: { swaggerTransform: apiDocumentation.sharing.revoke },
      preHandler: customerOnly,
    },
    async (request, reply) => {
      const params = ticketParamsSchema.safeParse(request.params)

      if (!params.success) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          'Informe um identificador de ingresso válido.',
        )
      }

      await revokeTicketShareLink(
        params.data.id,
        customerIdFromRequest(request),
      )

      return reply.code(204).send()
    },
  )
}

export const publicSharedTicketRoutes: FastifyPluginAsync<
  Pick<SharedTicketOptions, 'signingSecret'>
> = async (app, options) => {
  app.get(
    '/:token',
    {
      config: { swaggerTransform: apiDocumentation.sharing.getPublic },
      logLevel: 'silent',
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store')
      reply.header('X-Robots-Tag', 'noindex, nofollow')

      const params = sharedTicketParamsSchema.safeParse(request.params)

      if (!params.success) {
        throw new HttpError(
          404,
          'SHARED_TICKET_NOT_FOUND',
          'Ingresso compartilhado não encontrado.',
        )
      }

      return getSharedTicket(params.data.token, options.signingSecret)
    },
  )
}
