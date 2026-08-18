import { z } from 'zod'
import { HttpError } from '../../http/error-response.js'
import type {
  CatalogMovie,
  MovieCatalog,
} from './catalog.types.js'

const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3'
const DEFAULT_TIMEOUT_MS = 5_000

const tmdbMovieSchema = z.object({
  id: z.number().int().positive().max(2_147_483_647),
  title: z.string().min(1).max(240),
  overview: z.string().max(20_000),
  poster_path: z.string().max(255).nullable(),
  backdrop_path: z.string().max(255).nullable(),
  release_date: z.union([z.iso.date(), z.literal('')]),
})

const tmdbMovieDetailsSchema = tmdbMovieSchema.extend({
  runtime: z.number().int().nonnegative().max(2_147_483_647).nullable(),
})

const tmdbMovieListSchema = z.object({
  results: z.array(tmdbMovieSchema),
})

type FetchImplementation = typeof fetch

export interface TmdbCatalogOptions {
  accessToken?: string
  fetchImplementation?: FetchImplementation
  timeoutMs?: number
}

function mapMovie(movie: z.infer<typeof tmdbMovieSchema>): CatalogMovie {
  return {
    id: movie.id,
    title: movie.title,
    overview: movie.overview,
    posterPath: movie.poster_path,
    backdropPath: movie.backdrop_path,
    releaseDate: movie.release_date || null,
  }
}

export function createTmdbCatalog({
  accessToken,
  fetchImplementation = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: TmdbCatalogOptions): MovieCatalog {
  const normalizedAccessToken = accessToken?.trim()

  async function request(path: string, notFoundMeansMissingMovie = false) {
    if (!normalizedAccessToken) {
      throw new HttpError(
        503,
        'TMDB_NOT_CONFIGURED',
        'O catálogo de filmes não está configurado.',
      )
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImplementation(`${TMDB_API_BASE_URL}${path}`, {
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${normalizedAccessToken}`,
        },
        signal: controller.signal,
      })
      if (!response.ok) {
        if (notFoundMeansMissingMovie && response.status === 404) {
          throw new HttpError(404, 'MOVIE_NOT_FOUND', 'Filme não encontrado.')
        }

        throw new HttpError(
          502,
          'TMDB_UPSTREAM_ERROR',
          'Não foi possível consultar a TMDb.',
        )
      }

      try {
        return await response.json()
      } catch {
        if (controller.signal.aborted) {
          throw new HttpError(
            504,
            'TMDB_TIMEOUT',
            'A TMDb demorou demais para responder.',
          )
        }

        throw new HttpError(
          502,
          'TMDB_UPSTREAM_ERROR',
          'A TMDb retornou uma resposta inválida.',
        )
      }
    } catch (error) {
      if (error instanceof HttpError) {
        throw error
      }

      if (controller.signal.aborted) {
        throw new HttpError(
          504,
          'TMDB_TIMEOUT',
          'A TMDb demorou demais para responder.',
        )
      }

      throw new HttpError(
        502,
        'TMDB_UPSTREAM_ERROR',
        'Não foi possível consultar a TMDb.',
      )
    } finally {
      clearTimeout(timeout)
    }
  }

  async function readMovieList(path: string) {
    const parsedResponse = tmdbMovieListSchema.safeParse(await request(path))

    if (!parsedResponse.success) {
      throw new HttpError(
        502,
        'TMDB_UPSTREAM_ERROR',
        'A TMDb retornou uma resposta inválida.',
      )
    }

    return parsedResponse.data.results.map(mapMovie)
  }

  return {
    listNowPlaying() {
      const params = new URLSearchParams({ language: 'pt-BR', region: 'BR' })
      return readMovieList(`/movie/now_playing?${params.toString()}`)
    },

    searchMovies(query) {
      const params = new URLSearchParams({
        query,
        language: 'pt-BR',
        region: 'BR',
        include_adult: 'false',
      })
      return readMovieList(`/search/movie?${params.toString()}`)
    },

    async getMovieDetails(tmdbMovieId) {
      const params = new URLSearchParams({ language: 'pt-BR' })
      const response = await request(
        `/movie/${tmdbMovieId}?${params.toString()}`,
        true,
      )
      const parsedResponse = tmdbMovieDetailsSchema.safeParse(response)

      if (!parsedResponse.success) {
        throw new HttpError(
          502,
          'TMDB_UPSTREAM_ERROR',
          'A TMDb retornou uma resposta inválida.',
        )
      }

      return {
        ...mapMovie(parsedResponse.data),
        runtimeMinutes:
          parsedResponse.data.runtime === 0
            ? null
            : parsedResponse.data.runtime,
      }
    },
  }
}
