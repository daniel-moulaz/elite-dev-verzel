import type { FastifyPluginAsync } from 'fastify'
import { Role } from '../../generated/prisma/enums.js'
import { HttpError } from '../../http/error-response.js'
import { apiDocumentation } from '../../openapi/openapi.operations.js'
import { consumeTicketBodySchema } from './gate.schemas.js'
import { consumeGateTicket, listGateSessions } from './gate.service.js'

export interface GateRoutesOptions {
  signingSecret: string
}
function gateIdFromRequest(request: {
  authUser: { id: string } | null
}) {
  const gateId = request.authUser?.id

  if (!gateId) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Autenticação necessária.')
  }

  return gateId
}

export const gateRoutes: FastifyPluginAsync<GateRoutesOptions> = async (
  app,
  options,
) => {
  const gateOnly = [app.authenticate, app.authorizeRoles(Role.GATE)]

  app.get(
    '/sessions',
    {
      config: { swaggerTransform: apiDocumentation.gate.listSessions },
      preHandler: gateOnly,
    },
    async () => listGateSessions(),
  )

  app.post(
    '/tickets/consume',
    {
      config: { swaggerTransform: apiDocumentation.gate.consumeTicket },
      preHandler: gateOnly,
    },
    async (request, reply) => {
      const body = consumeTicketBodySchema.safeParse(request.body)

      if (!body.success) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          'Informe uma sessão e uma credencial válidas.',
        )
      }

      reply.header('Cache-Control', 'no-store')

      return consumeGateTicket(
        body.data.sessionId,
        body.data.credential,
        gateIdFromRequest(request),
        options.signingSecret,
      )
    },
  )
}
