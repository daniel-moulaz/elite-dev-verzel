import { z } from 'zod'

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(320)
  .pipe(z.email())

export const loginBodySchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1).max(128),
})
