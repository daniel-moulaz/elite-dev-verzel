import type { Role } from '../../generated/prisma/enums.js'

export interface PublicUser {
  id: string
  name: string
  email: string
  role: Role
}

export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
} as const
