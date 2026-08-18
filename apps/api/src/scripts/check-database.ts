import { prisma } from '../lib/prisma.js'

try {
  const rows = await prisma.$queryRaw<Array<{ result: number }>>`SELECT 1 AS result`

  if (rows[0]?.result !== 1) {
    throw new Error('O PostgreSQL retornou um resultado inesperado.')
  }

  console.log('Database connection: ok')
} catch (error) {
  console.error('Database connection: failed', error)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
