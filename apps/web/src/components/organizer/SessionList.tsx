import { useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  getOrganizerSessions,
  type OrganizerSession,
} from '../../api'
import {
  formatPrice,
  formatCompactSessionDay,
  formatSessionTime,
  tmdbPosterUrl,
} from './formatters'
import { PosterImage } from '../common/PosterImage'

interface SessionListProps {
  accessToken: string
  onCreate: () => void
  onOpen: (sessionId: string) => void
}

type SessionStatusFilter = 'ALL' | 'DRAFT' | 'PUBLISHED'

function normalizeSearchTerm(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
}

function sortSessions(
  first: OrganizerSession,
  second: OrganizerSession,
  referenceTime: number,
): number {
  const firstStart = new Date(first.startsAt).getTime()
  const secondStart = new Date(second.startsAt).getTime()
  const firstIsPast = firstStart < referenceTime
  const secondIsPast = secondStart < referenceTime

  if (firstIsPast !== secondIsPast) {
    return firstIsPast ? 1 : -1
  }

  const chronologicalOrder = firstIsPast
    ? secondStart - firstStart
    : firstStart - secondStart

  return chronologicalOrder || first.id.localeCompare(second.id)
}

export function SessionList({
  accessToken,
  onCreate,
  onOpen,
}: SessionListProps) {
  const [sessions, setSessions] = useState<OrganizerSession[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] =
    useState<SessionStatusFilter>('ALL')
  const [referenceTime, setReferenceTime] = useState(Date.now)

  useEffect(() => {
    const controller = new AbortController()

    getOrganizerSessions(accessToken, controller.signal)
      .then((loadedSessions) => {
        setSessions(loadedSessions)
        setReferenceTime(Date.now())
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        setError(
          requestError instanceof ApiError
            ? requestError.message
            : 'Não foi possível carregar suas sessões.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      })

    return () => controller.abort()
  }, [accessToken, revision])

  const sessionCounts = useMemo(
    () => ({
      all: sessions.length,
      drafts: sessions.filter((session) => session.status === 'DRAFT').length,
      published: sessions.filter((session) => session.status === 'PUBLISHED')
        .length,
    }),
    [sessions],
  )

  const visibleSessions = useMemo(() => {
    const normalizedQuery = normalizeSearchTerm(query.trim())

    return sessions
      .filter(
        (session) =>
          statusFilter === 'ALL' || session.status === statusFilter,
      )
      .filter(
        (session) =>
          !normalizedQuery ||
          normalizeSearchTerm(session.movie.title).includes(normalizedQuery),
      )
      .sort((first, second) => sortSessions(first, second, referenceTime))
  }, [query, referenceTime, sessions, statusFilter])

  const hasActiveFilters = Boolean(query.trim()) || statusFilter !== 'ALL'

  function clearFilters() {
    setQuery('')
    setStatusFilter('ALL')
  }

  return (
    <section className="organizer-content" aria-labelledby="sessions-title">
      <div className="page-heading">
        <div>
          <p className="section-kicker">Programação</p>
          <h1 id="sessions-title">Minhas sessões</h1>
          <p>Prepare a programação e publique quando tudo estiver conferido.</p>
        </div>
        <button type="button" onClick={onCreate}>
          Criar sessão
        </button>
      </div>

      {isLoading ? (
        <div className="content-state" aria-busy="true" aria-live="polite">
          <p className="section-kicker">Carregando</p>
          <h2>Buscando suas sessões…</h2>
        </div>
      ) : error ? (
        <div className="content-state error-state" role="alert">
          <p className="section-kicker">Algo deu errado</p>
          <h2>Não foi possível abrir a programação</h2>
          <p>{error}</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setIsLoading(true)
              setError(null)
              setRevision((current) => current + 1)
            }}
          >
            Tentar novamente
          </button>
        </div>
      ) : sessions.length === 0 ? (
        <div className="content-state empty-state">
          <span className="empty-ticket" aria-hidden="true">
            01
          </span>
          <p className="section-kicker">Sua primeira sessão</p>
          <h2>A programação ainda está vazia</h2>
          <p>Escolha um filme, configure a sala e salve seu rascunho.</p>
          <button type="button" onClick={onCreate}>
            Criar primeira sessão
          </button>
        </div>
      ) : (
        <>
          <div className="organizer-session-tools">
            <div className="session-list-search" role="search">
              <label htmlFor="organizer-session-query">Buscar por filme</label>
              <input
                id="organizer-session-query"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ex.: Interestelar"
              />
            </div>

            <div
              className="session-status-filters"
              role="group"
              aria-label="Filtrar sessões por status"
            >
              <button
                type="button"
                className={`session-filter-button${
                  statusFilter === 'ALL' ? ' is-active' : ''
                }`}
                aria-pressed={statusFilter === 'ALL'}
                onClick={() => setStatusFilter('ALL')}
              >
                Todas <span>{sessionCounts.all}</span>
              </button>
              <button
                type="button"
                className={`session-filter-button${
                  statusFilter === 'DRAFT' ? ' is-active' : ''
                }`}
                aria-pressed={statusFilter === 'DRAFT'}
                onClick={() => setStatusFilter('DRAFT')}
              >
                Rascunhos <span>{sessionCounts.drafts}</span>
              </button>
              <button
                type="button"
                className={`session-filter-button${
                  statusFilter === 'PUBLISHED' ? ' is-active' : ''
                }`}
                aria-pressed={statusFilter === 'PUBLISHED'}
                onClick={() => setStatusFilter('PUBLISHED')}
              >
                Publicadas <span>{sessionCounts.published}</span>
              </button>
            </div>

            <div className="session-list-results">
              <p aria-live="polite">
                {visibleSessions.length}{' '}
                {visibleSessions.length === 1
                  ? 'sessão exibida'
                  : 'sessões exibidas'}
              </p>
              {hasActiveFilters ? (
                <button
                  type="button"
                  className="text-button clear-session-filters"
                  onClick={clearFilters}
                >
                  Limpar filtros
                </button>
              ) : null}
            </div>
          </div>

          {visibleSessions.length === 0 ? (
            <div className="content-state empty-state filtered-empty-state">
              <p className="section-kicker">Nenhum resultado</p>
              <h2>Nenhuma sessão corresponde aos filtros</h2>
              <p>
                {query.trim()
                  ? `Não encontramos sessões para “${query.trim()}”.`
                  : 'Não há sessões com o status selecionado.'}
              </p>
              <button type="button" onClick={clearFilters}>
                Limpar filtros
              </button>
            </div>
          ) : (
            <div className="session-list">
              {visibleSessions.map((session) => {
                const posterUrl = tmdbPosterUrl(session.movie.posterPath)

                return (
                  <article
                    className={`session-card session-${session.status.toLowerCase()}`}
                    key={session.id}
                  >
                    <PosterImage
                      src={posterUrl}
                      title={session.movie.title}
                      className="session-poster"
                      loading="lazy"
                    />
                    <div className="session-card-body">
                      <div className="session-card-heading">
                        <div>
                          <span
                            className={`status-badge status-${session.status.toLowerCase()}`}
                          >
                            {session.status === 'DRAFT'
                              ? 'Rascunho'
                              : 'Publicada'}
                          </span>
                          <h2>{session.movie.title}</h2>
                        </div>
                        <time
                          className="session-date"
                          dateTime={session.startsAt}
                        >
                          <strong>
                            {formatSessionTime(session.startsAt)}
                          </strong>
                          <span>
                            {formatCompactSessionDay(session.startsAt)}
                          </span>
                        </time>
                      </div>
                      <dl className="session-facts">
                        <div>
                          <dt>Local</dt>
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
                          <dt>Ingresso</dt>
                          <dd>{formatPrice(session.priceCents)}</dd>
                        </div>
                      </dl>
                      <button
                        type="button"
                        className="secondary-button card-action"
                        onClick={() => onOpen(session.id)}
                      >
                        {session.status === 'DRAFT'
                          ? 'Revisar rascunho'
                          : 'Ver sessão'}
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </>
      )}
    </section>
  )
}
