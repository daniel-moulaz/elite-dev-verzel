import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.js'
import * as argon2 from 'argon2'
import { config } from 'dotenv'
import { DEMO_PASSWORD, DEMO_USERS } from './seed-data.js'

config({
  path: fileURLToPath(new URL('../../../.env', import.meta.url)),
  quiet: true,
})

async function seed() {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error('DATABASE_URL é obrigatória para executar o seed.')
  }

  const adapter = new PrismaPg({ connectionString })
  const prisma = new PrismaClient({ adapter })

  try {
    const usersWithHashes = await Promise.all(
      DEMO_USERS.map(async (user) => ({
        ...user,
        email: user.email.trim().toLowerCase(),
        passwordHash: await argon2.hash(DEMO_PASSWORD, {
          type: argon2.argon2id,
        }),
      })),
    )

    await prisma.$transaction(
      usersWithHashes.map(({ email, name, passwordHash, role }) =>
        prisma.user.upsert({
          where: { email },
          update: { name, passwordHash, role },
          create: { email, name, passwordHash, role },
        }),
      ),
    )

    console.log(`${usersWithHashes.length} usuários de demonstração preparados.`)
  } finally {
    await prisma.$disconnect()
  }
}

const entryFile = process.argv[1]

if (entryFile && pathToFileURL(resolve(entryFile)).href === import.meta.url) {
  await seed()
}
