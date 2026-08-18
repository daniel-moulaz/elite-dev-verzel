import { z } from 'zod'

export const listPublicSessionsQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(120).optional(),
})

export const publicSessionParamsSchema = z.strictObject({
  id: z.uuid(),
})
