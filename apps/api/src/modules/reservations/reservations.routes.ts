import type { FastifyPluginAsync } from 'fastify'
import { Role } from '../../generated/prisma/enums.js'
import { HttpError } from '../../http/error-response.js'
import { apiDocumentation } from '../../openapi/openapi.operations.js'
import {
  createReservationBodySchema,
  reservationParamsSchema,
} from './reservations.schemas.js'
import {
  createReservationHold,
  getCustomerReservation,
} from './reservations.service.js'

function invalidRequest(message = 'A requisição contém dados inválidos.') {
  return new HttpError(400, 'VALIDATION_ERROR', message)
}

export const reservationRoutes: FastifyPluginAsync = async (app) => {
  const customerOnly = [app.authenticate, app.authorizeRoles(Role.CUSTOMER)]

  app.post(
    '/',
    {
      config: { swaggerTransform: apiDocumentation.reservations.create },
      preHandler: customerOnly,
    },
    async (request, reply) => {
      const body = createReservationBodySchema.safeParse(request.body)

      if (!body.success) {
        throw invalidRequest()
      }

      const customerId = request.authUser?.id

      if (!customerId) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.')
      }

      const reservation = await createReservationHold(customerId, body.data)

      return reply.code(201).send(reservation)
    },
  )

  app.get(
    '/:id',
    {
      config: { swaggerTransform: apiDocumentation.reservations.get },
      preHandler: customerOnly,
    },
    async (request) => {
      const params = reservationParamsSchema.safeParse(request.params)

      if (!params.success) {
        throw invalidRequest('Informe um identificador de reserva válido.')
      }

      const customerId = request.authUser?.id

      if (!customerId) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.')
      }

      return getCustomerReservation(params.data.id, customerId)
    },
  )
}
