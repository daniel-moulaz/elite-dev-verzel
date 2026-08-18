import { z } from 'zod'

export const paymentParamsSchema = z.strictObject({
  id: z.uuid(),
})

export const processPaymentBodySchema = z.strictObject({
  outcome: z.enum(['APPROVED', 'DECLINED']),
})

export type ProcessPaymentInput = z.infer<typeof processPaymentBodySchema>
