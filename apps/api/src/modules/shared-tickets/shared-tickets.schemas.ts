import { z } from 'zod'

export const sharedTicketParamsSchema = z.strictObject({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
})
