import { randomBytes } from 'node:crypto'
import * as argon2 from 'argon2'
import { prisma } from '../../lib/prisma.js'
import { publicUserSelect, type PublicUser } from './auth.types.js'

let dummyPasswordHash: Promise<string> | undefined

function getDummyPasswordHash() {
  dummyPasswordHash ??= argon2.hash(randomBytes(32), {
    type: argon2.argon2id,
  })

  return dummyPasswordHash
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export async function authenticateCredentials(
  email: string,
  password: string,
): Promise<PublicUser | null> {
  const user = await prisma.user.findUnique({
    where: { email: normalizeEmail(email) },
    select: {
      ...publicUserSelect,
      passwordHash: true,
    },
  })

  const passwordHash = user?.passwordHash ?? (await getDummyPasswordHash())
  const passwordMatches = await argon2.verify(passwordHash, password)

  if (!user || !passwordMatches) {
    return null
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  }
}

export function findPublicUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: publicUserSelect,
  })
}
