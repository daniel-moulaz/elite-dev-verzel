import { useEffect, useState, type FormEvent } from 'react'
import {
  ApiError,
  getCatalogMovie,
  getCatalogMovies,
  type CatalogMovie,
} from '../../api'
import { movieYear, tmdbPosterUrl } from './formatters'

interface MoviePickerProps {
  accessToken: string
  disabled: boolean
  selectedMovie: CatalogMovie | null
  onSelect: (movie: CatalogMovie) => void
}

interface CatalogRequest {
  query: string
  revision: number
}

function movieDescription(movie: CatalogMovie): string {
  if (movie.runtimeMinutes) {
    return `${movieYear(movie.releaseDate)} · ${movie.runtimeMinutes} min`
  }

  return movieYear(movie.releaseDate)
}

export function MoviePicker({
  accessToken,
  disabled,
  selectedMovie,
  onSelect,
}: MoviePickerProps) {
  const [isChoosing, setIsChoosing] = useState(selectedMovie === null)
  const [query, setQuery] = useState('')
  const [request, setRequest] = useState<CatalogRequest>({
    query: '',
    revision: 0,
  })
  const [movies, setMovies] = useState<CatalogMovie[]>([])
  const [isLoading, setIsLoading] = useState(selectedMovie === null)
  const [selectingId, setSelectingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isChoosing) {
      return
    }

    const controller = new AbortController()

    getCatalogMovies(accessToken, request.query, controller.signal)
      .then((response) => {
        setMovies(response.movies)
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        setError(
          requestError instanceof ApiError
            ? requestError.message
            : 'Não foi possível consultar o catálogo agora.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      })

    return () => controller.abort()
  }, [accessToken, isChoosing, request.query, request.revision])

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsLoading(true)
    setError(null)
    setRequest((current) => ({
      query: query.trim(),
      revision: current.revision + 1,
    }))
  }

  async function handleSelect(movie: CatalogMovie) {
    setSelectingId(movie.id)
    setError(null)

    try {
      const details = await getCatalogMovie(accessToken, movie.id)
      onSelect(details)
      setIsChoosing(false)
    } catch (selectionError) {
      setError(
        selectionError instanceof ApiError
          ? selectionError.message
          : 'Não foi possível carregar os detalhes desse filme.',
      )
    } finally {
      setSelectingId(null)
    }
  }

  if (selectedMovie && !isChoosing) {
    const posterUrl = tmdbPosterUrl(selectedMovie.posterPath)

    return (
      <section
        className="selected-movie"
        aria-busy={disabled}
        aria-labelledby="selected-movie-title"
      >
        {posterUrl ? (
          <img src={posterUrl} alt={`Pôster de ${selectedMovie.title}`} />
        ) : (
          <div className="poster-placeholder" aria-hidden="true">
            Sem pôster
          </div>
        )}
        <div>
          <p className="section-kicker">Filme selecionado</p>
          <h2 id="selected-movie-title">{selectedMovie.title}</h2>
          <p>{movieDescription(selectedMovie)}</p>
          <button
            type="button"
            className="text-button"
            disabled={disabled}
            onClick={() => {
              setIsLoading(true)
              setError(null)
              setIsChoosing(true)
            }}
          >
            Escolher outro filme
          </button>
        </div>
      </section>
    )
  }

  const resultTitle = request.query
    ? `Resultados para “${request.query}”`
    : 'Filmes em cartaz'

  return (
    <section
      className="movie-picker"
      aria-busy={disabled || isLoading || selectingId !== null}
      aria-labelledby="movie-picker-title"
    >
      <div className="section-heading">
        <div>
          <p className="section-kicker">Passo 1</p>
          <h2 id="movie-picker-title">Escolha o filme</h2>
        </div>
        {selectedMovie ? (
          <button
            type="button"
            className="text-button"
            disabled={disabled}
            onClick={() => setIsChoosing(false)}
          >
            Manter seleção atual
          </button>
        ) : null}
      </div>

      <form className="movie-search" role="search" onSubmit={handleSearch}>
        <div className="field">
          <label htmlFor="movie-query">Título do filme</label>
          <input
            id="movie-query"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ex.: Interestelar"
            disabled={disabled || isLoading}
          />
        </div>
        <button type="submit" disabled={disabled || isLoading}>
          {isLoading ? 'Buscando…' : 'Buscar'}
        </button>
        {request.query ? (
          <button
            type="button"
            className="secondary-button"
            disabled={disabled || isLoading}
            onClick={() => {
              setQuery('')
              setIsLoading(true)
              setError(null)
              setRequest((current) => ({
                query: '',
                revision: current.revision + 1,
              }))
            }}
          >
            Ver em cartaz
          </button>
        ) : null}
      </form>

      {error ? (
        <div className="inline-state error-message" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="text-button"
            disabled={disabled}
            onClick={() => {
              setIsLoading(true)
              setError(null)
              setRequest((current) => ({
                ...current,
                revision: current.revision + 1,
              }))
            }}
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      <div className="catalog-heading">
        <h3>{resultTitle}</h3>
        {!isLoading ? <span>{movies.length} encontrados</span> : null}
      </div>

      {isLoading ? (
        <p className="inline-state" aria-live="polite">
          Carregando catálogo…
        </p>
      ) : movies.length === 0 && !error ? (
        <p className="inline-state">
          Nenhum filme encontrado. Tente outro título.
        </p>
      ) : (
        <div className="movie-grid">
          {movies.map((movie) => {
            const posterUrl = tmdbPosterUrl(movie.posterPath)
            const isSelecting = selectingId === movie.id

            return (
              <article className="movie-card" key={movie.id}>
                {posterUrl ? (
                  <img
                    src={posterUrl}
                    alt={`Pôster de ${movie.title}`}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="poster-placeholder" aria-hidden="true">
                    Sem pôster
                  </div>
                )}
                <div className="movie-card-content">
                  <h4>{movie.title}</h4>
                  <p>{movieYear(movie.releaseDate)}</p>
                  <button
                    type="button"
                    onClick={() => void handleSelect(movie)}
                    disabled={disabled || selectingId !== null}
                    aria-label={`Selecionar ${movie.title}`}
                  >
                    {isSelecting ? 'Carregando…' : 'Selecionar'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
