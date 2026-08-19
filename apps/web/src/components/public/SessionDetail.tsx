import { useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  createReservation,
  getPublicSession,
  getSessionSeats,
  type AuthenticatedUser,
  type PublicSessionDetail,
  type Reservation,
  type SessionSeat,
} from '../../api'
import {
  formatSessionDay,
  formatPrice,
  formatSessionTime,
  movieYear,
  tmdbBackdropUrl,
  tmdbPosterUrl,
} from '../organizer/formatters'
import { PosterImage } from '../common/PosterImage'

const maximumSeatsPerReservation = 6

interface SessionDetailProps {
  sessionId: string
  user: AuthenticatedUser | undefined
  accessToken: string | undefined
  onBack: () => void
  onRequireLogin: () => void
  onReservationCreated: (reservation: Reservation) => void
}

function groupSeatsByRow(seats: SessionSeat[]): Array<[string, SessionSeat[]]> {
  const rows = new Map<string, SessionSeat[]>()

  for (const seat of seats) {
    const row = rows.get(seat.rowLabel)

    if (row) {
      row.push(seat)
    } else {
      rows.set(seat.rowLabel, [seat])
    }
  }

  return Array.from(rows.entries())
}

export function SessionDetail({
  sessionId,
  user,
  accessToken,
  onBack,
  onRequireLogin,
  onReservationCreated,
}: SessionDetailProps) {
  const [session, setSession] = useState<PublicSessionDetail | null>(null)
  const [seats, setSeats] = useState<SessionSeat[]>([])
  const [selectedSeatIds, setSelectedSeatIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  )
  const [message, setMessage] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [failedBackdrop, setFailedBackdrop] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    Promise.all([
      getPublicSession(sessionId, controller.signal),
      getSessionSeats(sessionId, controller.signal),
    ])
      .then(([sessionResult, seatResult]) => {
        setSession(sessionResult)
        setSeats(seatResult)
        setStatus('ready')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        setMessage(
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar esta sessão.',
        )
        setStatus('error')
      })

    return () => controller.abort()
  }, [reloadKey, sessionId])

  const rows = useMemo(() => groupSeatsByRow(seats), [seats])
  const selectedSeats = useMemo(
    () => seats.filter((seat) => selectedSeatIds.has(seat.id)),
    [seats, selectedSeatIds],
  )
  const availableCount = useMemo(
    () => seats.filter((seat) => seat.status === 'AVAILABLE').length,
    [seats],
  )
  const estimatedTotal = (session?.priceCents ?? 0) * selectedSeats.length

  function toggleSeat(seat: SessionSeat) {
    if (seat.status !== 'AVAILABLE') {
      return
    }

    setMessage(null)

    if (
      !selectedSeatIds.has(seat.id) &&
      selectedSeatIds.size >= maximumSeatsPerReservation
    ) {
      setMessage(
        `Selecione no máximo ${maximumSeatsPerReservation} lugares por reserva.`,
      )
      return
    }

    setSelectedSeatIds((current) => {
      const next = new Set(current)

      if (next.has(seat.id)) {
        next.delete(seat.id)
        return next
      }

      next.add(seat.id)
      return next
    })
  }

  function retrySession() {
    setStatus('loading')
    setMessage(null)
    setSelectedSeatIds(new Set())
    setReloadKey((value) => value + 1)
  }

  async function refreshAvailability(clearCurrentMessage = true) {
    setIsRefreshing(true)
    if (clearCurrentMessage) {
      setMessage(null)
    }

    try {
      const refreshedSeats = await getSessionSeats(sessionId)
      const availableIds = new Set(
        refreshedSeats
          .filter((seat) => seat.status === 'AVAILABLE')
          .map((seat) => seat.id),
      )

      setSeats(refreshedSeats)
      setSelectedSeatIds((current) => {
        const next = new Set<string>()

        for (const seatId of current) {
          if (availableIds.has(seatId)) {
            next.add(seatId)
          }
        }

        return next
      })
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível atualizar os lugares.',
      )
    } finally {
      setIsRefreshing(false)
    }
  }

  async function handleReservation() {
    if (!user || !accessToken) {
      onRequireLogin()
      return
    }

    if (user.role !== 'CUSTOMER') {
      setMessage('Apenas clientes podem reservar lugares.')
      return
    }

    if (selectedSeatIds.size === 0) {
      setMessage('Selecione ao menos um lugar.')
      return
    }

    setIsSubmitting(true)
    setMessage(null)

    try {
      const reservation = await createReservation(
        accessToken,
        sessionId,
        Array.from(selectedSeatIds),
      )
      onReservationCreated(reservation)
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.code === 'SEAT_UNAVAILABLE' ||
          (error.status === 409 && error.code === undefined))
      ) {
        setMessage(
          'Um ou mais lugares acabaram de ficar indisponíveis. Atualizamos o mapa para você escolher novamente.',
        )
        await refreshAvailability(false)
      } else {
        setMessage(
          error instanceof ApiError
            ? error.message
            : 'Não foi possível reservar os lugares.',
        )
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="public-content">
        <div className="content-state public-state" aria-live="polite" aria-busy="true">
          <p className="section-kicker">Carregando</p>
          <h1>Preparando a sala…</h1>
        </div>
      </div>
    )
  }

  if (status === 'error' || !session) {
    return (
      <div className="public-content">
        <div className="content-state public-state" role="alert">
          <p className="section-kicker">Sessão indisponível</p>
          <h1>Não conseguimos abrir esta sessão.</h1>
          <p>{message}</p>
          <div className="button-row">
            <button type="button" className="secondary-button" onClick={onBack}>
              Voltar
            </button>
            <button type="button" onClick={retrySession}>
              Tentar novamente
            </button>
          </div>
        </div>
      </div>
    )
  }

  const posterUrl = tmdbPosterUrl(session.movie.posterPath)
  const backdropUrl = tmdbBackdropUrl(session.movie.backdropPath)

  return (
    <div className="public-content session-detail-page">
      <button type="button" className="back-button" onClick={onBack}>
        <span aria-hidden="true">←</span> Voltar à programação
      </button>

      <article className="public-session-hero">
        {backdropUrl && failedBackdrop !== backdropUrl ? (
          <img
            className="session-backdrop"
            src={backdropUrl}
            alt=""
            aria-hidden="true"
            onError={() => setFailedBackdrop(backdropUrl)}
          />
        ) : null}
        <div className="session-hero-content">
          <PosterImage
            className="detail-poster"
            src={posterUrl}
            title={session.movie.title}
            loading="eager"
          />
          <div className="session-title-block">
            <p className="section-kicker">Em cartaz</p>
            <h1>{session.movie.title}</h1>
            <p className="detail-movie-meta">
              <span>{movieYear(session.movie.releaseDate)}</span>
              {session.movie.runtimeMinutes ? (
                <span>{session.movie.runtimeMinutes} min</span>
              ) : null}
            </p>
          </div>
          <dl className="detail-facts">
            <div className="detail-showtime">
              <dt>Sessão</dt>
              <dd>
                <time dateTime={session.startsAt}>
                  <strong>{formatSessionTime(session.startsAt)}</strong>
                  <span>{formatSessionDay(session.startsAt)}</span>
                </time>
              </dd>
            </div>
            <div className="detail-cinema">
              <dt>Cinema</dt>
              <dd>
                <strong>{session.venueName}</strong>
                <span>{session.roomName}</span>
              </dd>
            </div>
            <div className="detail-address">
              <dt>Endereço</dt>
              <dd>{session.address}</dd>
            </div>
            <div className="detail-price">
              <dt>Ingresso</dt>
              <dd>{formatPrice(session.priceCents)}</dd>
            </div>
          </dl>
          <p className="movie-overview">
            {session.movie.overview || 'Sinopse não informada.'}
          </p>
        </div>
      </article>

      <section className="seat-selection" aria-labelledby="seat-map-heading">
        <div className="seat-map-heading">
          <div>
            <p className="section-kicker">Escolha seus lugares</p>
            <h2 id="seat-map-heading">Mapa da sala</h2>
            <p>
              {availableCount} de {session.capacity} lugares disponíveis. Limite
              de {maximumSeatsPerReservation} por reserva.
            </p>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void refreshAvailability()}
            disabled={isRefreshing}
          >
            {isRefreshing ? 'Atualizando…' : 'Atualizar lugares'}
          </button>
        </div>

        <div className="seat-workspace">
          <div className="seat-map-panel">
            <div className="screen-indicator" aria-label="Tela do cinema">
              <span>TELA</span>
            </div>
            <p className="seat-scroll-hint" aria-hidden="true">
              Deslize para os lados para ver toda a fileira.
            </p>

            <div
              className="seat-map-scroll"
              role="region"
              aria-label="Mapa de assentos; role horizontalmente em salas maiores"
              tabIndex={0}
            >
              <div
                className="seat-map"
                role="group"
                aria-labelledby="seat-map-heading"
              >
                {rows.map(([rowLabel, rowSeats]) => (
                  <div className="seat-row" key={rowLabel}>
                    <span className="row-label" aria-hidden="true">
                      {rowLabel}
                    </span>
                    <div className="seat-buttons">
                      {rowSeats.map((seat) => {
                        const isSelected = selectedSeatIds.has(seat.id)
                        const isAvailable = seat.status === 'AVAILABLE'
                        const stateLabel = isSelected
                          ? 'selecionado'
                          : isAvailable
                            ? 'disponível'
                            : seat.status === 'SOLD'
                              ? 'vendido'
                              : 'indisponível'

                        return (
                          <button
                            type="button"
                            className={`seat-button ${isSelected ? 'seat-selected' : ''} ${isAvailable ? 'seat-available' : 'seat-unavailable'}`}
                            key={seat.id}
                            onClick={() => toggleSeat(seat)}
                            disabled={!isAvailable}
                            aria-label={`Assento ${seat.label}, ${stateLabel}`}
                            aria-pressed={isAvailable ? isSelected : undefined}
                          >
                            <span className="seat-shape" aria-hidden="true">
                              {isSelected ? '✓' : isAvailable ? '' : '×'}
                            </span>
                            <span>{seat.label}</span>
                          </button>
                        )
                      })}
                    </div>
                    <span className="row-label row-label-end" aria-hidden="true">
                      {rowLabel}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <ul className="seat-legend" aria-label="Legenda do mapa">
              <li><span className="legend-seat available-symbol" aria-hidden="true" /> Disponível</li>
              <li><span className="legend-seat selected-symbol" aria-hidden="true">✓</span> Selecionado</li>
              <li><span className="legend-seat unavailable-symbol" aria-hidden="true">×</span> Indisponível</li>
            </ul>
          </div>

          <aside
            className="selection-summary"
            aria-label="Resumo da seleção"
          >
            <p className="section-kicker">Sua seleção</p>
            <div>
              <span>Assentos</span>
              <strong aria-live="polite" aria-atomic="true">
                {selectedSeats.length > 0
                  ? selectedSeats.map((seat) => seat.label).join(', ')
                  : 'Nenhum selecionado'}
              </strong>
            </div>
            <div className="selection-total">
              <span>Total</span>
              <strong>{formatPrice(estimatedTotal)}</strong>
            </div>

            {message ? (
              <p className="message error-message" role="alert">
                {message}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => void handleReservation()}
              disabled={selectedSeatIds.size === 0 || isSubmitting}
            >
              {isSubmitting ? 'Reservando…' : 'Reservar por 10 minutos'}
            </button>
            <p className="backend-authority-note">
              Disponibilidade e valor final confirmados pelo servidor.
            </p>
          </aside>
        </div>
      </section>
    </div>
  )
}
