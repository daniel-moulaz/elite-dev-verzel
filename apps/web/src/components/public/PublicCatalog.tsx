import { useEffect, useState, type FormEvent } from 'react'
import {
  ApiError,
  getPublicSessions,
  type PublicSessionSummary,
} from '../../api'
import { PosterImage } from '../common/PosterImage'
import {
  formatCompactSessionDay,
  formatPrice,
  formatSessionDay,
  formatSessionTime,
  movieYear,
  tmdbPosterUrl,
} from '../organizer/formatters'

interface PublicCatalogProps {
  onOpenSession: (sessionId: string) => void
}

interface SessionDateOption {
  key: string
  startsAt: string
}

interface VenueProgram {
  key: string
  venueName: string
  roomName: string
  sessions: PublicSessionSummary[]
}

interface MovieProgram {
  key: string
  movie: PublicSessionSummary['movie']
  firstSession: PublicSessionSummary
  venues: VenueProgram[]
  minimumPriceCents: number
  hasDifferentPrices: boolean
}

const weekdayFormatter = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
})

const dayFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
})

const monthFormatter = new Intl.DateTimeFormat('pt-BR', {
  month: 'short',
})

function localDateKey(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function dateOptions(sessions: PublicSessionSummary[]): SessionDateOption[] {
  const dates = new Map<string, string>()

  for (const session of sessions) {
    const key = localDateKey(session.startsAt)

    if (!dates.has(key)) {
      dates.set(key, session.startsAt)
    }
  }

  return Array.from(dates, ([key, startsAt]) => ({ key, startsAt }))
}

function movieGroupKey(session: PublicSessionSummary): string {
  return [session.movie.title, session.movie.releaseDate ?? ''].join('\u0000')
}

function groupSessionsByMovie(
  sessions: PublicSessionSummary[],
): MovieProgram[] {
  const movieGroups = new Map<
    string,
    {
      movie: PublicSessionSummary['movie']
      sessions: PublicSessionSummary[]
    }
  >()

  for (const session of sessions) {
    const key = movieGroupKey(session)
    const group = movieGroups.get(key)

    if (group) {
      group.sessions.push(session)
    } else {
      movieGroups.set(key, {
        movie: session.movie,
        sessions: [session],
      })
    }
  }

  return Array.from(movieGroups, ([key, group]) => {
    const venueGroups = new Map<string, VenueProgram>()
    const prices = new Set<number>()

    for (const session of group.sessions) {
      const venueKey = `${session.venueName}\u0000${session.roomName}`
      const venue = venueGroups.get(venueKey)

      prices.add(session.priceCents)

      if (venue) {
        venue.sessions.push(session)
      } else {
        venueGroups.set(venueKey, {
          key: venueKey,
          venueName: session.venueName,
          roomName: session.roomName,
          sessions: [session],
        })
      }
    }

    return {
      key,
      movie: group.movie,
      // Cada grupo nasce com a sessão que o criou.
      firstSession: group.sessions[0]!,
      venues: Array.from(venueGroups.values()),
      minimumPriceCents: Math.min(...prices),
      hasDifferentPrices: prices.size > 1,
    }
  })
}

function dateTabLabels(startsAt: string) {
  const date = new Date(startsAt)
  const isToday = localDateKey(date) === localDateKey(new Date())

  return {
    weekday: isToday
      ? 'Hoje'
      : weekdayFormatter.format(date).replace('.', ''),
    day: dayFormatter.format(date),
    month: monthFormatter.format(date).replace('.', ''),
  }
}

export function PublicCatalog({ onOpenSession }: PublicCatalogProps) {
  const [queryInput, setQueryInput] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [selectedDateKey, setSelectedDateKey] = useState('')
  const [sessions, setSessions] = useState<PublicSessionSummary[]>([])
  const [catalogSessions, setCatalogSessions] = useState<
    PublicSessionSummary[]
  >([])
  const [featuredSession, setFeaturedSession] =
    useState<PublicSessionSummary | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  )
  const [errorMessage, setErrorMessage] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    getPublicSessions(activeQuery, controller.signal)
      .then((result) => {
        const sortedSessions = [...result].sort(
          (first, second) =>
            new Date(first.startsAt).getTime() -
            new Date(second.startsAt).getTime(),
        )
        setSessions(sortedSessions)

        if (!activeQuery) {
          setCatalogSessions(sortedSessions)
          setFeaturedSession((current) => {
            if (!current) {
              return sortedSessions[0] ?? null
            }

            return (
              sortedSessions.find(
                (session) =>
                  movieGroupKey(session) === movieGroupKey(current),
              ) ??
              sortedSessions[0] ??
              null
            )
          })
        }

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
    setSelectedDateKey('')

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
    setSelectedDateKey('')

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

  const availableDates = dateOptions(sessions)
  const effectiveDateKey = availableDates.some(
    (option) => option.key === selectedDateKey,
  )
    ? selectedDateKey
    : (availableDates[0]?.key ?? '')
  const selectedDate = availableDates.find(
    (option) => option.key === effectiveDateKey,
  )
  const selectedSessions = sessions.filter(
    (session) => localDateKey(session.startsAt) === effectiveDateKey,
  )
  const moviePrograms = groupSessionsByMovie(selectedSessions)
  const catalogMovies = groupSessionsByMovie(catalogSessions)
  const featuredPosterUrl = featuredSession
    ? tmdbPosterUrl(featuredSession.movie.posterPath)
    : null
  const featuredMovieKey = featuredSession
    ? movieGroupKey(featuredSession)
    : null
  const venueNames = Array.from(
    new Set(sessions.map((session) => session.venueName)),
  )
  const programmingContext =
    venueNames.length === 1
      ? venueNames[0]
      : `${venueNames.length} cinemas na programação`

  return (
    <div className="public-content catalog-page">
      <h1 className="visually-hidden">Programação SEPTEM Cinemas</h1>

      {status === 'loading' && !featuredSession ? (
        <section
          className="cinematic-stage cinematic-stage-loading"
          aria-busy="true"
          aria-live="polite"
        >
          <p className="visually-hidden">Carregando filme em destaque…</p>
          <div className="stage-loading-inner" aria-hidden="true">
            <div className="stage-loading-poster" />
            <div className="stage-loading-copy">
              <span /><span /><span />
            </div>
          </div>
        </section>
      ) : null}

      {featuredSession ? (
        <section
          className="cinematic-stage"
          aria-labelledby="featured-movie-title"
        >
          <div
            className="stage-atmosphere"
            style={
              featuredPosterUrl
                ? { backgroundImage: `url("${featuredPosterUrl}")` }
                : undefined
            }
            aria-hidden="true"
          />
          <div className="stage-inner">
            <PosterImage
              className="stage-poster"
              src={featuredPosterUrl}
              title={featuredSession.movie.title}
              loading="eager"
            />
            <div className="stage-copy">
              <p className="stage-kicker">Agora na SEPTEM</p>
              <h2 id="featured-movie-title">{featuredSession.movie.title}</h2>
              <p className="stage-meta">
                {featuredSession.movie.releaseDate ? (
                  <span>{movieYear(featuredSession.movie.releaseDate)}</span>
                ) : null}
                <span>Ingresso {formatPrice(featuredSession.priceCents)}</span>
              </p>
              <p className="stage-location">
                <strong>{featuredSession.venueName}</strong>
                <span>{featuredSession.roomName}</span>
              </p>
              <div className="stage-next-session">
                <div>
                  <span>Próxima sessão</span>
                  <small>
                    {formatCompactSessionDay(featuredSession.startsAt)}
                  </small>
                </div>
                <button
                  type="button"
                  className="stage-showtime-button"
                  onClick={() => onOpenSession(featuredSession.id)}
                  aria-label={`Escolher lugares para ${featuredSession.movie.title}, em ${formatSessionDay(featuredSession.startsAt)}, às ${formatSessionTime(featuredSession.startsAt)}, ${featuredSession.venueName}, ${featuredSession.roomName}`}
                >
                  <time dateTime={featuredSession.startsAt}>
                    {formatSessionTime(featuredSession.startsAt)}
                  </time>
                  <span>Escolher lugares</span>
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {status === 'loading' && catalogMovies.length === 0 ? (
        <section className="poster-rail-section poster-rail-loading">
          <div className="poster-rail-heading">
            <p>SEPTEM Cinemas</p>
            <h2>Em cartaz</h2>
          </div>
          <div className="poster-rail-skeleton" aria-hidden="true">
            <span /><span /><span /><span /><span />
          </div>
        </section>
      ) : null}

      {catalogMovies.length > 0 ? (
        <section className="poster-rail-section" aria-labelledby="poster-rail-title">
          <header className="poster-rail-heading">
            <p>SEPTEM Cinemas</p>
            <h2 id="poster-rail-title">Em cartaz</h2>
          </header>
          <p className="visually-hidden" role="status" aria-live="polite">
            {featuredSession
              ? `Filme em destaque: ${featuredSession.movie.title}`
              : ''}
          </p>
          <div className="poster-rail" aria-label="Filmes em cartaz">
            {catalogMovies.map((program) => {
              const isActive = program.key === featuredMovieKey
              const posterUrl = tmdbPosterUrl(program.movie.posterPath)

              return (
                <button
                  type="button"
                  className={`poster-rail-item ${isActive ? 'is-active' : ''}`.trim()}
                  key={program.key}
                  aria-pressed={isActive}
                  onClick={() => setFeaturedSession(program.firstSession)}
                >
                  <span className="poster-rail-frame">
                    <PosterImage
                      className="poster-rail-poster"
                      src={posterUrl}
                      title={program.movie.title}
                      decorative
                    />
                  </span>
                  <span className="poster-rail-caption">
                    <strong>{program.movie.title}</strong>
                    <small>
                      {isActive
                        ? 'Em destaque'
                        : program.movie.releaseDate
                          ? movieYear(program.movie.releaseDate)
                          : 'Em cartaz'}
                    </small>
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      <section
        className="programming-board"
        id="programming"
        aria-labelledby="programming-title"
      >
        <div className="programming-board-inner">
          <header className="programming-toolbar">
            <div>
              <p className="section-kicker">
                {status === 'ready' && sessions.length > 0
                  ? programmingContext
                  : 'SEPTEM Cinemas'}
              </p>
              <h2 id="programming-title">Programação</h2>
            </div>

            <form className="program-search" onSubmit={handleSearch} role="search">
              <label className="visually-hidden" htmlFor="session-search">
                Buscar por filme ou cinema
              </label>
              <input
                id="session-search"
                type="search"
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="Buscar filme ou cinema"
                maxLength={120}
                disabled={status === 'loading'}
              />
              <button type="submit" disabled={status === 'loading'}>
                Buscar
              </button>
            </form>
          </header>

          {activeQuery && status !== 'loading' ? (
            <div className="search-context">
              <p>
                Resultado para <strong>“{activeQuery}”</strong>
              </p>
              <button type="button" className="text-button" onClick={clearSearch}>
                Limpar busca
              </button>
            </div>
          ) : null}

          {status === 'loading' ? (
            <div className="program-loading" aria-busy="true" aria-live="polite">
              <p className="visually-hidden">Carregando programação…</p>
              <div className="date-strip-loading" aria-hidden="true">
                <span /><span /><span /><span />
              </div>
              {[0, 1].map((item) => (
                <div className="movie-program-skeleton" key={item} aria-hidden="true">
                  <span />
                  <div><span /><span /><span /></div>
                </div>
              ))}
            </div>
          ) : null}

          {status === 'error' ? (
            <div className="content-state public-state" role="alert">
              <p className="section-kicker">Não foi possível carregar</p>
              <h3>
                {activeQuery
                  ? 'Não foi possível concluir a busca.'
                  : 'Não foi possível atualizar a programação.'}
              </h3>
              <p>
                {errorMessage}
                {!activeQuery && catalogSessions.length > 0
                  ? ' Os filmes acima são do último carregamento concluído.'
                  : ''}
              </p>
              <button type="button" onClick={retry}>
                Tentar novamente
              </button>
            </div>
          ) : null}

          {status === 'ready' && sessions.length === 0 ? (
            <div className="content-state public-state empty-state">
              <p className="visually-hidden" role="status">
                {activeQuery
                  ? 'Nenhum resultado encontrado para a busca.'
                  : 'Nenhuma sessão publicada no momento.'}
              </p>
              <span className="state-symbol" aria-hidden="true">○</span>
              <h3>
                {activeQuery
                  ? 'Nenhuma sessão corresponde à busca.'
                  : 'Ainda não há sessões publicadas.'}
              </h3>
              <p>
                {activeQuery
                  ? 'Tente outro filme, cinema ou limpe a busca.'
                  : 'Volte em breve para conferir a próxima programação.'}
              </p>
              {activeQuery ? (
                <button type="button" onClick={clearSearch}>Ver toda a programação</button>
              ) : null}
            </div>
          ) : null}

          {status === 'ready' && sessions.length > 0 ? (
            <>
              <div
                className="date-selector"
                role="group"
                aria-label="Escolha a data da programação"
              >
                {availableDates.map((option) => {
                  const labels = dateTabLabels(option.startsAt)
                  const isSelected = option.key === effectiveDateKey

                  return (
                    <button
                      type="button"
                      className={`date-option ${isSelected ? 'is-selected' : ''}`.trim()}
                      key={option.key}
                      aria-pressed={isSelected}
                      aria-controls="program-by-date"
                      aria-label={`Mostrar sessões de ${formatSessionDay(option.startsAt)}`}
                      onClick={() => setSelectedDateKey(option.key)}
                    >
                      <span>{labels.weekday}</span>
                      <strong>{labels.day}</strong>
                      <small>{labels.month}</small>
                    </button>
                  )
                })}
              </div>

              <div id="program-by-date">
                <div
                  className="selected-program-date"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <h3>{selectedDate ? formatSessionDay(selectedDate.startsAt) : ''}</h3>
                  <span>
                    {selectedSessions.length}{' '}
                    {selectedSessions.length === 1 ? 'sessão' : 'sessões'}
                  </span>
                </div>

                {moviePrograms.length === 0 ? (
                  <div className="content-state public-state empty-state">
                    <h3>Nenhuma sessão nesta data.</h3>
                    <p>Escolha outro dia disponível acima.</p>
                  </div>
                ) : (
                  <div className="movie-program-list">
                    {moviePrograms.map((program) => (
                      <article className="movie-program" key={program.key}>
                        <header className="movie-program-heading">
                          <div>
                            <h3>{program.movie.title}</h3>
                            {program.movie.releaseDate ? (
                              <p>{movieYear(program.movie.releaseDate)}</p>
                            ) : null}
                          </div>
                          <p className="movie-program-price">
                            <span>
                              {program.hasDifferentPrices
                                ? 'A partir de'
                                : 'Ingresso'}
                            </span>
                            <strong>{formatPrice(program.minimumPriceCents)}</strong>
                          </p>
                        </header>

                        <div className="venue-program-list">
                          {program.venues.map((venue) => (
                            <section
                              className="venue-program"
                              key={venue.key}
                              aria-label={`${venue.venueName}, ${venue.roomName}`}
                            >
                              <div className="venue-program-heading">
                                <strong>{venue.venueName}</strong>
                                <span>{venue.roomName}</span>
                              </div>
                              <div className="showtime-list">
                                {venue.sessions.map((session) => (
                                  <button
                                    type="button"
                                    className="showtime-button"
                                    key={session.id}
                                    onClick={() => onOpenSession(session.id)}
                                    aria-label={`Sessão de ${program.movie.title} em ${formatSessionDay(session.startsAt)}, às ${formatSessionTime(session.startsAt)}, ${venue.venueName}, ${venue.roomName}, ingresso ${formatPrice(session.priceCents)}`}
                                  >
                                    <time dateTime={session.startsAt}>
                                      {formatSessionTime(session.startsAt)}
                                    </time>
                                  </button>
                                ))}
                              </div>
                            </section>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </section>
    </div>
  )
}
