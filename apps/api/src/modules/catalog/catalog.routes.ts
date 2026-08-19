import type { FastifyPluginAsync } from 'fastify'
import { Role } from '../../generated/prisma/enums.js'
import { HttpError } from '../../http/error-response.js'
import { apiDocumentation } from '../../openapi/openapi.operations.js'
import {
  catalogMovieParamsSchema,
  catalogMoviesQuerySchema,
} from './catalog.schemas.js'
import type { MovieCatalog } from './catalog.types.js'

interface CatalogRoutesOptions {
  catalog: MovieCatalog
}

export const catalogRoutes: FastifyPluginAsync<CatalogRoutesOptions> = async (
  app,
  { catalog },
) => {
  const organizerOnly = [
    app.authenticate,
    app.authorizeRoles(Role.ORGANIZER),
  ]

  app.get(
    '/movies',
    {
      config: { swaggerTransform: apiDocumentation.catalog.listMovies },
      preHandler: organizerOnly,
    },
    async (request) => {
      const parsedQuery = catalogMoviesQuerySchema.safeParse(request.query)

      if (!parsedQuery.success) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          'Informe uma busca de filme válida.',
        )
      }

      const movies = parsedQuery.data.q
        ? await catalog.searchMovies(parsedQuery.data.q)
        : await catalog.listNowPlaying()

      return { movies }
    },
  )

  app.get(
    '/movies/:tmdbId',
    {
      config: { swaggerTransform: apiDocumentation.catalog.getMovie },
      preHandler: organizerOnly,
    },
    async (request) => {
      const parsedParams = catalogMovieParamsSchema.safeParse(request.params)

      if (!parsedParams.success) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          'Informe um identificador de filme válido.',
        )
      }

      return catalog.getMovieDetails(parsedParams.data.tmdbId)
    },
  )
}
