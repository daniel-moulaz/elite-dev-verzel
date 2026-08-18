import type { FastifyInstance, FastifyReply } from 'fastify'

type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INTERNAL_ERROR'

export function sendError(
  reply: FastifyReply,
  statusCode: number,
  error: ErrorCode,
  message: string,
) {
  return reply.code(statusCode).send({ error, message })
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    if (
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      error.statusCode === 400
    ) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'A requisição contém dados inválidos.',
      )
    }

    request.log.error({ err: error }, 'Erro interno ao processar a requisição')

    return sendError(
      reply,
      500,
      'INTERNAL_ERROR',
      'Não foi possível concluir a solicitação.',
    )
  })
}
