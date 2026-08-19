import { z } from 'zod'

export const consumeTicketBodySchema = z.strictObject({
  sessionId: z.uuid(),
  credential: z.string().trim().min(1).max(2_048),
})
