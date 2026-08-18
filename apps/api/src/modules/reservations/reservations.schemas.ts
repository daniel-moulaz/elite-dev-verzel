import { z } from 'zod'

export const MAX_SEATS_PER_RESERVATION = 6

export const createReservationBodySchema = z
  .strictObject({
    sessionId: z.uuid(),
    seatIds: z
      .array(z.uuid())
      .min(1)
      .max(MAX_SEATS_PER_RESERVATION),
  })
  .refine((body) => new Set(body.seatIds).size === body.seatIds.length, {
    message: 'Os assentos não podem ser repetidos.',
    path: ['seatIds'],
  })

export const reservationParamsSchema = z.strictObject({
  id: z.uuid(),
})

export type CreateReservationInput = z.infer<
  typeof createReservationBodySchema
>
