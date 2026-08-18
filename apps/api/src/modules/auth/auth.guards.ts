import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Role } from '../../generated/prisma/enums.js'
import { sendError } from '../../http/error-response.js'
import { findPublicUserById } from './auth.service.js'

const userIdSchema = z.uuid()

export async function authenticateRequest(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  let userId: string

  try {
    await request.jwtVerify()
    const parsedUserId = userIdSchema.safeParse(request.user.sub)

    if (!parsedUserId.success) {
      sendError(reply, 401, 'UNAUTHORIZED', 'Autenticação necessária.')
      return
    }

    userId = parsedUserId.data
  } catch {
    sendError(reply, 401, 'UNAUTHORIZED', 'Autenticação necessária.')
    return
  }

  const user = await findPublicUserById(userId)

  if (!user) {
    sendError(reply, 401, 'UNAUTHORIZED', 'Autenticação necessária.')
    return
  }

  request.authUser = user
}

export function authorizeRoles(...allowedRoles: Role[]) {
  const allowedRoleSet = new Set(allowedRoles)

  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.authUser) {
      sendError(reply, 401, 'UNAUTHORIZED', 'Autenticação necessária.')
      return
    }

    if (!allowedRoleSet.has(request.authUser.role)) {
      sendError(
        reply,
        403,
        'FORBIDDEN',
        'Você não possui permissão para acessar este recurso.',
      )
    }
  }
}
