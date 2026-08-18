import Fastify from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerErrorHandler } from '../src/http/error-response.js'
import { catalogRoutes } from '../src/modules/catalog/catalog.routes.js'
import type {
  CatalogMovie,
  CatalogMovieDetails,
  MovieCatalog,
} from '../src/modules/catalog/catalog.types.js'
import { createTmdbCatalog } from '../src/modules/catalog/tmdb.client.js'

const movie: CatalogMovie = {
  id: 11,
  title: 'Central do Brasil',
  overview: 'Uma viagem pelo Brasil.',
  posterPath: '/poster.jpg',
  backdropPath: '/backdrop.jpg',
  releaseDate: '1998-04-03',
}

const movieDetails: CatalogMovieDetails = {
  ...movie,
  runtimeMinutes: 113,
}

const appsToClose: ReturnType<typeof Fastify>[] = []

afterEach(async () => {
  await Promise.all(appsToClose.splice(0).map((app) => app.close()))
})

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function tmdbMovie(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    title: 'Central do Brasil',
    overview: 'Uma viagem pelo Brasil.',
    poster_path: '/poster.jpg',
    backdrop_path: '/backdrop.jpg',
    release_date: '1998-04-03',
    ...overrides,
  }
}

function requestedUrl(fetchMock: ReturnType<typeof vi.fn>) {
  const firstCall = fetchMock.mock.calls[0]

  if (!firstCall) {
    throw new Error('A chamada esperada à TMDb não ocorreu.')
  }

  const input = firstCall[0]

  if (typeof input === 'string' || input instanceof URL) {
    return new URL(input)
  }

  if (input instanceof Request) {
    return new URL(input.url)
  }

  throw new Error('URL inesperada no fetch de teste.')
}

function buildCatalogTestApp(catalog: MovieCatalog) {
  const app = Fastify()
  appsToClose.push(app)
  registerErrorHandler(app)
  app.decorate('authenticate', async () => undefined)
  app.decorate('authorizeRoles', () => async () => undefined)
  app.register(catalogRoutes, { prefix: '/catalog', catalog })
  return app
}

describe('cliente TMDb', () => {
  it('maps now-playing movies and sends backend-only authentication and locale parameters', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ results: [tmdbMovie()] }))
    const catalog = createTmdbCatalog({
      accessToken: 'test-access-token',
      fetchImplementation: fetchMock,
    })

    await expect(catalog.listNowPlaying()).resolves.toEqual([movie])

    const url = requestedUrl(fetchMock)
    expect(url.pathname).toBe('/3/movie/now_playing')
    expect(url.searchParams.get('language')).toBe('pt-BR')
    expect(url.searchParams.get('region')).toBe('BR')

    const requestOptions = fetchMock.mock.calls[0]?.[1]
    const headers = new Headers(requestOptions?.headers)
    expect(headers.get('authorization')).toBe('Bearer test-access-token')
    expect(headers.get('accept')).toBe('application/json')
  })

  it('uses the search endpoint with the exact query and safe parameters', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ results: [] }))
    const catalog = createTmdbCatalog({
      accessToken: 'test-access-token',
      fetchImplementation: fetchMock,
    })

    await expect(catalog.searchMovies('Central do Brasil')).resolves.toEqual(
      [],
    )

    const url = requestedUrl(fetchMock)
    expect(url.pathname).toBe('/3/search/movie')
    expect(url.searchParams.get('query')).toBe('Central do Brasil')
    expect(url.searchParams.get('language')).toBe('pt-BR')
    expect(url.searchParams.get('region')).toBe('BR')
    expect(url.searchParams.get('include_adult')).toBe('false')
  })

  it('maps only the movie details needed by a session snapshot', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        ...tmdbMovie(),
        runtime: 113,
        genres: [{ id: 18, name: 'Drama' }],
      }),
    )
    const catalog = createTmdbCatalog({
      accessToken: 'test-access-token',
      fetchImplementation: fetchMock,
    })

    await expect(catalog.getMovieDetails(11)).resolves.toEqual(movieDetails)

    const url = requestedUrl(fetchMock)
    expect(url.pathname).toBe('/3/movie/11')
    expect(url.searchParams.get('language')).toBe('pt-BR')
  })

  it('normalizes optional TMDb data without inventing values', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        ...tmdbMovie({
          overview: '',
          poster_path: null,
          backdrop_path: null,
          release_date: '',
        }),
        runtime: null,
      }),
    )
    const catalog = createTmdbCatalog({
      accessToken: 'test-access-token',
      fetchImplementation: fetchMock,
    })

    await expect(catalog.getMovieDetails(11)).resolves.toMatchObject({
      overview: '',
      posterPath: null,
      backdropPath: null,
      releaseDate: null,
      runtimeMinutes: null,
    })
  })

  it('treats a zero runtime from TMDb as unknown', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        ...tmdbMovie(),
        runtime: 0,
      }),
    )
    const catalog = createTmdbCatalog({
      accessToken: 'test-access-token',
      fetchImplementation: fetchMock,
    })

    await expect(catalog.getMovieDetails(11)).resolves.toMatchObject({
      runtimeMinutes: null,
    })
  })

  it('translates upstream failures without exposing their response', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ status_message: 'sensitive' }, 503))
    const catalog = createTmdbCatalog({
      accessToken: 'test-access-token',
      fetchImplementation: fetchMock,
    })

    await expect(catalog.listNowPlaying()).rejects.toMatchObject({
      statusCode: 502,
      code: 'TMDB_UPSTREAM_ERROR',
      message: 'Não foi possível consultar a TMDb.',
    })
  })

  it('returns a domain 404 when the requested movie does not exist', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({}, 404))
    const catalog = createTmdbCatalog({
      accessToken: 'test-access-token',
      fetchImplementation: fetchMock,
    })

    await expect(catalog.getMovieDetails(999_999)).rejects.toMatchObject({
      statusCode: 404,
      code: 'MOVIE_NOT_FOUND',
    })
  })

  it('rejects an invalid external payload as a controlled upstream error', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ results: [{ id: 'invalid' }] }))
    const catalog = createTmdbCatalog({
      accessToken: 'test-access-token',
      fetchImplementation: fetchMock,
    })

    await expect(catalog.listNowPlaying()).rejects.toMatchObject({
      statusCode: 502,
      code: 'TMDB_UPSTREAM_ERROR',
      message: 'A TMDb retornou uma resposta inválida.',
    })
  })

  it('returns a gateway timeout when the external request exceeds its deadline', async () => {
    const fetchImplementation: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        )
      })
    const catalog = createTmdbCatalog({
      accessToken: 'test-access-token',
      fetchImplementation,
      timeoutMs: 5,
    })

    await expect(catalog.listNowPlaying()).rejects.toMatchObject({
      statusCode: 504,
      code: 'TMDB_TIMEOUT',
    })
  })

  it('keeps the timeout active while reading the external response body', async () => {
    const fetchImplementation: typeof fetch = async (_input, init) =>
      ({
        ok: true,
        status: 200,
        json: () =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true },
            )
          }),
      }) as Response
    const catalog = createTmdbCatalog({
      accessToken: 'test-access-token',
      fetchImplementation,
      timeoutMs: 5,
    })

    await expect(catalog.listNowPlaying()).rejects.toMatchObject({
      statusCode: 504,
      code: 'TMDB_TIMEOUT',
    })
  })

  it('fails before making an HTTP request when the token is not configured', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    const catalog = createTmdbCatalog({ fetchImplementation: fetchMock })

    await expect(catalog.listNowPlaying()).rejects.toMatchObject({
      statusCode: 503,
      code: 'TMDB_NOT_CONFIGURED',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('rotas de catálogo', () => {
  it('lists now-playing movies or searches by a normalized query', async () => {
    const catalog: MovieCatalog = {
      listNowPlaying: vi.fn(async () => [movie]),
      searchMovies: vi.fn(async () => [movie]),
      getMovieDetails: vi.fn(async () => movieDetails),
    }
    const app = buildCatalogTestApp(catalog)

    const nowPlaying = await app.inject({
      method: 'GET',
      url: '/catalog/movies',
    })
    const search = await app.inject({
      method: 'GET',
      url: '/catalog/movies?q=%20Central%20do%20Brasil%20',
    })

    expect(nowPlaying.statusCode).toBe(200)
    expect(nowPlaying.json()).toEqual({ movies: [movie] })
    expect(catalog.listNowPlaying).toHaveBeenCalledOnce()
    expect(search.statusCode).toBe(200)
    expect(search.json()).toEqual({ movies: [movie] })
    expect(catalog.searchMovies).toHaveBeenCalledWith('Central do Brasil')
  })

  it('returns mapped details and rejects invalid route input', async () => {
    const catalog: MovieCatalog = {
      listNowPlaying: vi.fn(async () => [movie]),
      searchMovies: vi.fn(async () => [movie]),
      getMovieDetails: vi.fn(async () => movieDetails),
    }
    const app = buildCatalogTestApp(catalog)

    const details = await app.inject({
      method: 'GET',
      url: '/catalog/movies/11',
    })
    const invalidId = await app.inject({
      method: 'GET',
      url: '/catalog/movies/not-a-number',
    })
    const invalidQuery = await app.inject({
      method: 'GET',
      url: '/catalog/movies?q=%20%20',
    })

    expect(details.statusCode).toBe(200)
    expect(details.json()).toEqual(movieDetails)
    expect(catalog.getMovieDetails).toHaveBeenCalledWith(11)
    expect(invalidId.statusCode).toBe(400)
    expect(invalidQuery.statusCode).toBe(400)
  })
})
