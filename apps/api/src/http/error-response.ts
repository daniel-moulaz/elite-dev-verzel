import type { FastifyInstance, FastifyReply } from 'fastify'

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'TMDB_NOT_CONFIGURED'
  | 'TMDB_TIMEOUT'
  | 'TMDB_UPSTREAM_ERROR'
  | 'MOVIE_NOT_FOUND'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_NOT_EDITABLE'
  | 'SESSION_ALREADY_PUBLISHED'
  | 'SESSION_NOT_PUBLISHABLE'
  | 'SEAT_UNAVAILABLE'
  | 'RESERVATION_EXPIRED'
  | 'SESSION_NOT_AVAILABLE'
  | 'RESERVATION_NOT_FOUND'
  | 'INTERNAL_ERROR'

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

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
    if (error instanceof HttpError) {
      if (error.statusCode >= 500) {
        request.log.warn(
          { err: error },
          'Falha controlada ao processar a requisição',
        )
      }

      return sendError(reply, error.statusCode, error.code, error.message)
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    ) {
      const { statusCode } = error

      if (statusCode === 404) {
        return sendError(
          reply,
          404,
          'NOT_FOUND',
          'Recurso não encontrado.',
        )
      }

      return sendError(
        reply,
        statusCode,
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
