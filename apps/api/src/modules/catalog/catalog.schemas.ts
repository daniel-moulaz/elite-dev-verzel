import { z } from 'zod'

export const catalogMoviesQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(100).optional(),
})

export const catalogMovieParamsSchema = z.strictObject({
  tmdbId: z.coerce.number().int().positive(),
})
