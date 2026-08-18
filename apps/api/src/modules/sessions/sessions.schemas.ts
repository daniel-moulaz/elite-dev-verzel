import { z } from 'zod'

const startsAtSchema = z
  .iso.datetime({ offset: true })
  .transform((value) => new Date(value))

const sessionFields = {
  tmdbMovieId: z.number().int().positive().max(2_147_483_647),
  startsAt: startsAtSchema,
  venueName: z.string().trim().min(1).max(120),
  roomName: z.string().trim().min(1).max(80),
  address: z.string().trim().min(1).max(240),
  priceCents: z.number().int().min(0).max(10_000_000),
  rows: z.number().int().min(1).max(10),
  seatsPerRow: z.number().int().min(1).max(20),
}

export const createSessionBodySchema = z.strictObject(sessionFields)

export const updateSessionBodySchema = z
  .strictObject({
    tmdbMovieId: sessionFields.tmdbMovieId.optional(),
    startsAt: sessionFields.startsAt.optional(),
    venueName: sessionFields.venueName.optional(),
    roomName: sessionFields.roomName.optional(),
    address: sessionFields.address.optional(),
    priceCents: sessionFields.priceCents.optional(),
    rows: sessionFields.rows.optional(),
    seatsPerRow: sessionFields.seatsPerRow.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Informe ao menos um campo para edição.',
  })
  .refine(
    (body) => (body.rows === undefined) === (body.seatsPerRow === undefined),
    {
      message: 'Fileiras e assentos por fileira devem ser informados juntos.',
      path: ['rows'],
    },
  )

export const sessionParamsSchema = z.strictObject({
  id: z.uuid(),
})

export type CreateSessionInput = z.infer<typeof createSessionBodySchema>
export type UpdateSessionInput = z.infer<typeof updateSessionBodySchema>
