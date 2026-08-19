import type { FastifyPluginAsync } from 'fastify'
import { Role } from '../../generated/prisma/enums.js'
import { HttpError } from '../../http/error-response.js'
import { apiDocumentation } from '../../openapi/openapi.operations.js'
import {
  paymentParamsSchema,
  processPaymentBodySchema,
} from './payments.schemas.js'
import { processReservationPayment } from './payments.service.js'

function invalidRequest(message = 'A requisição contém dados inválidos.') {
  return new HttpError(400, 'VALIDATION_ERROR', message)
}

export const paymentRoutes: FastifyPluginAsync = async (app) => {
  const customerOnly = [app.authenticate, app.authorizeRoles(Role.CUSTOMER)]

  app.post(
    '/:id/payment',
    {
      config: { swaggerTransform: apiDocumentation.payments.process },
      preHandler: customerOnly,
    },
    async (request) => {
      const params = paymentParamsSchema.safeParse(request.params)
      const body = processPaymentBodySchema.safeParse(request.body)

      if (!params.success) {
        throw invalidRequest('Informe um identificador de reserva válido.')
      }

      if (!body.success) {
        throw invalidRequest()
      }

      const customerId = request.authUser?.id

      if (!customerId) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.')
      }

      return processReservationPayment(params.data.id, customerId, body.data)
    },
  )
}
