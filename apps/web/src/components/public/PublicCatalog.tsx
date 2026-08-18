import { useEffect, useState, type FormEvent } from 'react'
import {
  ApiError,
  getPublicSessions,
  type PublicSessionSummary,
} from '../../api'
import {
  formatPrice,
  formatSessionDate,
  movieYear,
  tmdbPosterUrl,
} from '../organizer/formatters'

interface PublicCatalogProps {
  onOpenSession: (sessionId: string) => void
}

export function PublicCatalog({ onOpenSession }: PublicCatalogProps) {
  const [queryInput, setQueryInput] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [sessions, setSessions] = useState<PublicSessionSummary[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  )
  const [errorMessage, setErrorMessage] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    getPublicSessions(activeQuery, controller.signal)
      .then((result) => {
        setSessions(result)
        setStatus('ready')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        setErrorMessage(
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar a programação.',
        )
        setStatus('error')
      })

    return () => controller.abort()
  }, [activeQuery, reloadKey])

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextQuery = queryInput.trim()
    setStatus('loading')
    setErrorMessage('')

    if (nextQuery === activeQuery) {
      setReloadKey((value) => value + 1)
    } else {
      setActiveQuery(nextQuery)
    }
  }

  function clearSearch() {
    setQueryInput('')
    setStatus('loading')
    setErrorMessage('')

    if (activeQuery) {
      setActiveQuery('')
    } else {
      setReloadKey((value) => value + 1)
    }
  }

  function retry() {
    setStatus('loading')
    setErrorMessage('')
    setReloadKey((value) => value + 1)
  }

  return (
    <div className="public-content catalog-page">
      <section className="catalog-hero">
        <div>
          <p className="section-kicker">Programação</p>
          <h1>Seu próximo filme começa aqui.</h1>
          <p>
            Escolha uma sessão publicada, encontre seus lugares e garanta dez
            minutos para concluir a reserva.
          </p>
        </div>

        <form className="public-search" onSubmit={handleSearch} role="search">
          <label htmlFor="session-search">Buscar por filme ou cinema</label>
          <div>
            <input
              id="session-search"
              type="search"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder="Ex.: Interestelar"
              maxLength={120}
            />
            <button type="submit">Buscar</button>
          </div>
        </form>
      </section>

      <section aria-labelledby="sessions-heading">
        <div className="catalog-section-heading">
          <div>
            <p className="section-kicker">
              {activeQuery ? 'Resultado da busca' : 'Em cartaz'}
            </p>
            <h2 id="sessions-heading">
              {activeQuery ? `Sessões para “${activeQuery}”` : 'Próximas sessões'}
            </h2>
          </div>
          {activeQuery ? (
            <button type="button" className="text-button" onClick={clearSearch}>
              Limpar busca
            </button>
          ) : null}
        </div>

        {status === 'loading' ? (
          <div className="content-state public-state" aria-live="polite" aria-busy="true">
            <p className="section-kicker">Carregando</p>
            <h2>Preparando a programação…</h2>
          </div>
        ) : null}

        {status === 'error' ? (
          <div className="content-state public-state" role="alert">
            <p className="section-kicker">Não foi possível carregar</p>
            <h2>A programação está temporariamente indisponível.</h2>
            <p>{errorMessage}</p>
            <button type="button" onClick={retry}>
              Tentar novamente
            </button>
          </div>
        ) : null}

        {status === 'ready' && sessions.length === 0 ? (
          <div className="content-state public-state empty-state">
            <span className="empty-ticket" aria-hidden="true">
              0
            </span>
            <h2>
              {activeQuery
                ? 'Nenhuma sessão corresponde à busca.'
                : 'Ainda não há sessões publicadas.'}
            </h2>
            <p>
              {activeQuery
                ? 'Tente outro filme, cinema ou limpe a busca.'
                : 'Volte em breve para conferir a próxima programação.'}
            </p>
          </div>
        ) : null}

        {status === 'ready' && sessions.length > 0 ? (
          <div className="public-session-grid">
            {sessions.map((session) => {
              const posterUrl = tmdbPosterUrl(session.movie.posterPath)

              return (
                <article className="public-session-card" key={session.id}>
                  {posterUrl ? (
                    <img
                      src={posterUrl}
                      alt={`Pôster de ${session.movie.title}`}
                      loading="lazy"
                    />
                  ) : (
                    <div className="poster-placeholder" aria-hidden="true">
                      Pôster indisponível
                    </div>
                  )}
                  <div className="public-session-card-body">
                    <p className="session-date">
                      {formatSessionDate(session.startsAt)}
                    </p>
                    <h3>{session.movie.title}</h3>
                    <p className="movie-year">
                      {movieYear(session.movie.releaseDate)}
                    </p>
                    <dl>
                      <div>
                        <dt>Cinema</dt>
                        <dd>{session.venueName}</dd>
                      </div>
                      <div>
                        <dt>Sala</dt>
                        <dd>{session.roomName}</dd>
                      </div>
                      <div>
                        <dt>Capacidade</dt>
                        <dd>{session.capacity} lugares</dd>
                      </div>
                      <div>
                        <dt>A partir de</dt>
                        <dd>{formatPrice(session.priceCents)}</dd>
                      </div>
                    </dl>
                    <button
                      type="button"
                      onClick={() => onOpenSession(session.id)}
                      aria-label={`Ver sessão de ${session.movie.title} em ${formatSessionDate(session.startsAt)}`}
                    >
                      Escolher lugares
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        ) : null}
      </section>
    </div>
  )
}
