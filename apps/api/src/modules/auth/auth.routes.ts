import type { FastifyPluginAsync } from 'fastify'
import { sendError } from '../../http/error-response.js'
import { loginBodySchema } from './auth.schemas.js'
import { authenticateCredentials } from './auth.service.js'

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/login', async (request, reply) => {
    const parsedBody = loginBodySchema.safeParse(request.body)

    if (!parsedBody.success) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Informe um e-mail e uma senha válidos.',
      )
    }

    const user = await authenticateCredentials(
      parsedBody.data.email,
      parsedBody.data.password,
    )

    if (!user) {
      return sendError(
        reply,
        401,
        'INVALID_CREDENTIALS',
        'E-mail ou senha inválidos.',
      )
    }

    const accessToken = await reply.jwtSign(
      { role: user.role },
      { sub: user.id },
    )

    return { accessToken, user }
  })

  app.get(
    '/me',
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      if (!request.authUser) {
        return sendError(reply, 401, 'UNAUTHORIZED', 'Autenticação necessária.')
      }

      return request.authUser
    },
  )
}
