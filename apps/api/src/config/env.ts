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
    // Ligue somente quando a API estiver mesmo atrás de um proxy confiável.
    // Confiar em `X-Forwarded-For` sem proxy permitiria forjar a origem e
    // escapar do limite de abuso do login.
    TRUST_PROXY: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  })
  .refine(
    ({ JWT_SECRET, TICKET_SIGNING_SECRET }) =>
      JWT_SECRET !== TICKET_SIGNING_SECRET,
    {
      message: 'Use um segredo de ingresso diferente do segredo de login.',
      path: ['TICKET_SIGNING_SECRET'],
    },
  )

const parsedEnv = envSchema.safeParse({
  ...process.env,
  API_PORT: process.env.PORT ?? process.env.API_PORT,
})

if (!parsedEnv.success) {
  throw new Error(`Variáveis de ambiente inválidas:\n${z.prettifyError(parsedEnv.error)}`)
}

export const env = parsedEnv.data
