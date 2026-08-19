import type { FastifyPluginAsync } from 'fastify'
import { Role } from '../../generated/prisma/enums.js'
import { HttpError } from '../../http/error-response.js'
import { apiDocumentation } from '../../openapi/openapi.operations.js'
import { ticketParamsSchema } from './tickets.schemas.js'
import {
  getCustomerTicket,
  listCustomerTickets,
} from './tickets.service.js'

export interface TicketRoutesOptions {
  signingSecret: string
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

export const ticketRoutes: FastifyPluginAsync<TicketRoutesOptions> = async (
  app,
  options,
) => {
  const customerOnly = [app.authenticate, app.authorizeRoles(Role.CUSTOMER)]

  app.get(
    '/',
    {
      config: { swaggerTransform: apiDocumentation.tickets.list },
      preHandler: customerOnly,
    },
    async (request) => listCustomerTickets(customerIdFromRequest(request)),
  )

  app.get(
    '/:id',
    {
      config: { swaggerTransform: apiDocumentation.tickets.get },
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

      reply.header('Cache-Control', 'no-store')

      return getCustomerTicket(
        params.data.id,
        customerIdFromRequest(request),
        options.signingSecret,
      )
    },
  )
}
