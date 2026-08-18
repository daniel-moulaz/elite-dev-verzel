import { z } from 'zod'

export const ticketParamsSchema = z.strictObject({
  id: z.uuid(),
})
