import type { FastifyPluginAsync } from 'fastify'
import { sendError } from '../../http/error-response.js'
import { apiDocumentation } from '../../openapi/openapi.operations.js'
import { loginBodySchema } from './auth.schemas.js'
import { authenticateCredentials } from './auth.service.js'
import {
  clearFailedLogins,
  loginRetryAfterSeconds,
  loginThrottleKey,
  registerFailedLogin,
} from './login-throttle.js'

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/login',
    { config: { swaggerTransform: apiDocumentation.auth.login } },
    async (request, reply) => {
      const parsedBody = loginBodySchema.safeParse(request.body)

      if (!parsedBody.success) {
        return sendError(
          reply,
          400,
          'VALIDATION_ERROR',
          'Informe um e-mail e uma senha válidos.',
        )
      }

      // A chave é a origem, nunca o e-mail: um cliente abusivo limita apenas
      // a si mesmo, e ninguém consegue bloquear a conta de outra pessoa. A
      // verificação vem antes do Argon2, então uma origem sob bloqueio para
      // de consumir CPU do servidor.
      const throttleKey = loginThrottleKey(request.ip)
      const retryAfterSeconds = loginRetryAfterSeconds(throttleKey)

      if (retryAfterSeconds !== null) {
        reply.header('retry-after', String(retryAfterSeconds))

        return sendError(
          reply,
          429,
          'TOO_MANY_LOGIN_ATTEMPTS',
          'Muitas tentativas de login. Tente novamente em alguns minutos.',
        )
      }

      const user = await authenticateCredentials(
        parsedBody.data.email,
        parsedBody.data.password,
      )

      if (!user) {
        registerFailedLogin(throttleKey)

        return sendError(
          reply,
          401,
          'INVALID_CREDENTIALS',
          'E-mail ou senha inválidos.',
        )
      }

      clearFailedLogins(throttleKey)

      const accessToken = await reply.jwtSign(
        { role: user.role },
        { sub: user.id },
      )

      return { accessToken, user }
    },
  )

  app.get(
    '/me',
    {
      config: { swaggerTransform: apiDocumentation.auth.me },
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
