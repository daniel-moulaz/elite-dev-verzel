import { resolve } from 'node:path'
import { config } from 'dotenv'
import { z } from 'zod'

config({
  path: resolve(import.meta.dirname, '../../../../.env'),
  quiet: true,
})

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    API_HOST: z.string().min(1).default('127.0.0.1'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3333),
    DATABASE_URL: z.url(),
    WEB_ORIGIN: z.url().default('http://localhost:5173'),
    JWT_SECRET: z.string().min(32),
    TICKET_SIGNING_SECRET: z.string().min(32),
    TMDB_READ_ACCESS_TOKEN: z.string().trim().min(1).optional(),
  })
  .refine(
    ({ JWT_SECRET, TICKET_SIGNING_SECRET }) =>
      JWT_SECRET !== TICKET_SIGNING_SECRET,
    {
      message: 'Use um segredo de ingresso diferente do segredo de login.',
      path: ['TICKET_SIGNING_SECRET'],
    },
  )

const parsedEnv = envSchema.safeParse(process.env)

if (!parsedEnv.success) {
  throw new Error(`Variáveis de ambiente inválidas:\n${z.prettifyError(parsedEnv.error)}`)
}

export const env = parsedEnv.data
