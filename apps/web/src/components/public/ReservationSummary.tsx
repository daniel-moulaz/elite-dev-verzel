import { useEffect, useState } from 'react'
import {
  ApiError,
  getReservation,
  type Reservation,
} from '../../api'
import {
  formatPrice,
  formatSessionDate,
  tmdbPosterUrl,
} from '../organizer/formatters'

interface ReservationSummaryProps {
  reservationId: string
  accessToken: string
  initialReservation: Reservation | undefined
  onBackToSession: (sessionId: string) => void
  onBackToCatalog: () => void
}

function formatRemainingTime(remainingMilliseconds: number): string {
  const totalSeconds = Math.max(
    0,
    Math.ceil(remainingMilliseconds / 1_000),
  )
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function reservationRemainingTime(reservation?: Reservation): number {
  if (!reservation || reservation.status !== 'PENDING') {
    return 0
  }

  return Math.max(0, new Date(reservation.expiresAt).getTime() - Date.now())
}

export function ReservationSummary({
  reservationId,
  accessToken,
  initialReservation,
  onBackToSession,
  onBackToCatalog,
}: ReservationSummaryProps) {
  const [reservation, setReservation] = useState<Reservation | null>(
    initialReservation?.id === reservationId ? initialReservation : null,
  )
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    initialReservation?.id === reservationId ? 'ready' : 'loading',
  )
  const [errorMessage, setErrorMessage] = useState('')
  const [remainingMilliseconds, setRemainingMilliseconds] = useState(() =>
    reservationRemainingTime(initialReservation),
  )
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    getReservation(accessToken, reservationId, controller.signal)
      .then((result) => {
        setReservation(result)
        setRemainingMilliseconds(reservationRemainingTime(result))
        setStatus('ready')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        setErrorMessage(
          error instanceof ApiError
            ? error.message
            : 'Não foi possível consultar sua reserva.',
        )
        setStatus('error')
      })

    return () => controller.abort()
  }, [accessToken, reloadKey, reservationId])

  const expiresAt = reservation?.expiresAt
  const reservationStatus = reservation?.status

  useEffect(() => {
    if (!expiresAt || reservationStatus !== 'PENDING') {
      return
    }

    const controller = new AbortController()
    let expirationWasChecked = false

    function updateCountdown() {
      const remaining = new Date(expiresAt as string).getTime() - Date.now()
      setRemainingMilliseconds(Math.max(0, remaining))

      if (remaining <= 0 && !expirationWasChecked) {
        expirationWasChecked = true
        getReservation(accessToken, reservationId, controller.signal)
          .then((result) => {
            setReservation(result)
            setRemainingMilliseconds(reservationRemainingTime(result))
          })
          .catch((error: unknown) => {
            if (!controller.signal.aborted) {
              setErrorMessage(
                error instanceof ApiError
                  ? error.message
                  : 'Não foi possível confirmar a expiração da reserva.',
              )
            }
          })
      }
    }

    const intervalId = window.setInterval(updateCountdown, 1_000)

    return () => {
      controller.abort()
      window.clearInterval(intervalId)
    }
  }, [accessToken, expiresAt, reservationId, reservationStatus])

  function retryReservation() {
    setStatus('loading')
    setErrorMessage('')
    setReloadKey((value) => value + 1)
  }

  if (status === 'loading') {
    return (
      <div className="public-content">
        <div className="content-state public-state" aria-busy="true" aria-live="polite">
          <p className="section-kicker">Consultando reserva</p>
          <h1>Confirmando seus lugares…</h1>
        </div>
      </div>
    )
  }

  if (status === 'error' || !reservation) {
    return (
      <div className="public-content">
        <div className="content-state public-state" role="alert">
          <p className="section-kicker">Reserva indisponível</p>
          <h1>Não foi possível abrir esta reserva.</h1>
          <p>{errorMessage}</p>
          <div className="button-row">
            <button type="button" className="secondary-button" onClick={onBackToCatalog}>
              Ver programação
            </button>
            <button type="button" onClick={retryReservation}>
              Tentar novamente
            </button>
          </div>
        </div>
      </div>
    )
  }

  const isPending = reservation.status === 'PENDING'
  const isLocallyExpired = isPending && remainingMilliseconds <= 0
  const isExpired = reservation.status === 'EXPIRED' || isLocallyExpired
  const posterUrl = tmdbPosterUrl(reservation.session.movie.posterPath)

  return (
    <div className="public-content reservation-page">
      <button type="button" className="back-button" onClick={onBackToCatalog}>
        <span aria-hidden="true">←</span> Voltar à programação
      </button>

      <article className={`reservation-ticket ${isExpired ? 'reservation-expired' : ''}`}>
        <div className="reservation-ticket-main">
          {posterUrl ? (
            <img src={posterUrl} alt={`Pôster de ${reservation.session.movie.title}`} />
          ) : (
            <div className="poster-placeholder" aria-hidden="true">
              Pôster indisponível
            </div>
          )}

          <div>
            <p className="section-kicker">
              {isExpired ? 'Reserva expirada' : 'Lugares reservados'}
            </p>
            <h1>{reservation.session.movie.title}</h1>
            <p className="reservation-lead">
              {isExpired
                ? 'O prazo terminou e os lugares foram liberados para a sala.'
                : 'Seus lugares estão protegidos temporariamente. O servidor confirma o prazo abaixo.'}
            </p>

            <dl className="reservation-facts">
              <div>
                <dt>Sessão</dt>
                <dd>{formatSessionDate(reservation.session.startsAt)}</dd>
              </div>
              <div>
                <dt>Local</dt>
                <dd>
                  {reservation.session.venueName}, {reservation.session.roomName}
                </dd>
              </div>
              <div>
                <dt>Assentos</dt>
                <dd>
                  {reservation.seats.length > 0
                    ? reservation.seats.map((seat) => seat.label).join(', ')
                    : 'Lugares liberados'}
                </dd>
              </div>
              <div>
                <dt>Total confirmado</dt>
                <dd>{formatPrice(reservation.totalCents)}</dd>
              </div>
            </dl>
          </div>
        </div>

        <aside className="reservation-timer">
          <span>{isExpired ? 'Status' : 'Tempo restante'}</span>
          <strong>{isExpired ? 'EXPIRADA' : formatRemainingTime(remainingMilliseconds)}</strong>
          <p>
            {isExpired
              ? 'Escolha os lugares novamente para criar uma nova reserva.'
              : 'O pagamento será disponibilizado em uma próxima etapa.'}
          </p>
        </aside>
      </article>

      {errorMessage ? (
        <p className="message error-message" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {isExpired ? (
        <button
          type="button"
          onClick={() => onBackToSession(reservation.session.id)}
        >
          Escolher lugares novamente
        </button>
      ) : (
        <p className="checkout-later-note">
          Hold confirmado. O pagamento ainda não faz parte deste milestone.
        </p>
      )}
    </div>
  )
}
