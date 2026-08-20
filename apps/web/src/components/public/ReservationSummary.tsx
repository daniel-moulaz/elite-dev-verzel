import { useEffect, useRef, useState } from 'react'
import {
  ApiError,
  getReservation,
  payReservation,
  type PaymentStatus,
  type Reservation,
} from '../../api'
import {
  formatPrice,
  formatSessionDay,
  formatSessionTime,
  tmdbPosterUrl,
} from '../organizer/formatters'
import { PosterImage } from '../common/PosterImage'

const holdDurationMilliseconds = 10 * 60 * 1_000
const warningThresholdMilliseconds = 2 * 60 * 1_000
const criticalThresholdMilliseconds = 60 * 1_000

interface ReservationSummaryProps {
  reservationId: string
  accessToken: string
  initialReservation: Reservation | undefined
  onBackToSession: (sessionId: string) => void
  onBackToCatalog: () => void
  onOpenTicket: (ticketId: string) => void
  onOpenTickets: () => void
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
  onOpenTicket,
  onOpenTickets,
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
  const [paymentAction, setPaymentAction] = useState<PaymentStatus | null>(null)
  const [issuedTicketId, setIssuedTicketId] = useState<string | null>(null)
  const [isCheckingExpiration, setIsCheckingExpiration] = useState(false)
  const [isSynchronizing, setIsSynchronizing] = useState(
    Boolean(initialReservation),
  )
  const paymentInFlightRef = useRef(false)
  const expirationCheckInFlightRef = useRef(false)

  useEffect(() => {
    const controller = new AbortController()

    getReservation(accessToken, reservationId, controller.signal)
      .then((result) => {
        setReservation(result)
        setRemainingMilliseconds(reservationRemainingTime(result))
        setErrorMessage('')
        setIsCheckingExpiration(false)
        expirationCheckInFlightRef.current = false
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
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsSynchronizing(false)
        }
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
    let nextExpirationCheckAt = 0

    function updateCountdown() {
      const remaining = new Date(expiresAt as string).getTime() - Date.now()
      setRemainingMilliseconds(Math.max(0, remaining))

      if (
        remaining <= 0 &&
        Date.now() >= nextExpirationCheckAt &&
        !expirationCheckInFlightRef.current &&
        !paymentInFlightRef.current
      ) {
        nextExpirationCheckAt = Date.now() + 5_000
        expirationCheckInFlightRef.current = true
        setIsCheckingExpiration(true)
        getReservation(accessToken, reservationId, controller.signal)
          .then((result) => {
            setReservation(result)
            setRemainingMilliseconds(reservationRemainingTime(result))
            setErrorMessage('')
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
          .finally(() => {
            expirationCheckInFlightRef.current = false
            if (!controller.signal.aborted) {
              setIsCheckingExpiration(false)
            }
          })
      }
    }

    updateCountdown()
    const intervalId = window.setInterval(updateCountdown, 1_000)

    return () => {
      expirationCheckInFlightRef.current = false
      controller.abort()
      window.clearInterval(intervalId)
    }
  }, [accessToken, expiresAt, reservationId, reservationStatus])

  function retryReservation() {
    setStatus('loading')
    setIsSynchronizing(true)
    setErrorMessage('')
    setIsCheckingExpiration(false)
    expirationCheckInFlightRef.current = false
    setReloadKey((value) => value + 1)
  }

  async function simulatePayment(outcome: PaymentStatus) {
    if (
      paymentInFlightRef.current ||
      expirationCheckInFlightRef.current ||
      reservation?.status !== 'PENDING' ||
      isCheckingExpiration ||
      isSynchronizing
    ) {
      return
    }

    paymentInFlightRef.current = true
    setPaymentAction(outcome)
    setErrorMessage('')

    try {
      const result = await payReservation(accessToken, reservationId, outcome)
      setReservation((current) =>
        current
          ? {
              ...current,
              status: result.reservation.status,
              seats:
                result.reservation.status === 'CANCELLED'
                  ? []
                  : current.seats,
            }
          : current,
      )
      setIssuedTicketId(result.tickets[0]?.id ?? null)
      setIsCheckingExpiration(false)
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível processar a simulação de pagamento.',
      )

      if (
        error instanceof ApiError &&
        (error.code === 'RESERVATION_EXPIRED' ||
          error.code === 'PAYMENT_ALREADY_PROCESSED')
      ) {
        setStatus('loading')
        setReloadKey((value) => value + 1)
      }
    } finally {
      paymentInFlightRef.current = false
      setPaymentAction(null)
    }
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
  const deadlineReachedLocally = isPending && remainingMilliseconds <= 0
  const isExpired = reservation.status === 'EXPIRED'
  const isPaid = reservation.status === 'PAID'
  const isCancelled = reservation.status === 'CANCELLED'
  const posterUrl = tmdbPosterUrl(reservation.session.movie.posterPath)
  const countdownState =
    remainingMilliseconds <= criticalThresholdMilliseconds
      ? 'critical'
      : remainingMilliseconds <= warningThresholdMilliseconds
        ? 'warning'
        : 'normal'
  const progressPercentage = Math.min(
    100,
    Math.max(0, (remainingMilliseconds / holdDurationMilliseconds) * 100),
  )

  return (
    <div className="public-content reservation-page">
      <button type="button" className="back-button" onClick={onBackToCatalog}>
        <span aria-hidden="true">←</span> Voltar à programação
      </button>

      <article
        className={`reservation-ticket ${isExpired ? 'reservation-expired' : ''} ${isCancelled ? 'reservation-cancelled' : ''} ${isPaid ? 'reservation-paid' : ''} ${isPending ? `reservation-${countdownState}` : ''} ${isCheckingExpiration ? 'reservation-confirming' : ''}`}
      >
        <div className="reservation-ticket-main">
          <PosterImage
            className="reservation-poster"
            src={posterUrl}
            title={reservation.session.movie.title}
            loading="eager"
          />

          <div>
            <p className="section-kicker">
              {isExpired
                ? 'Reserva expirada'
                : isPaid
                  ? 'Pagamento aprovado'
                  : isCancelled
                    ? 'Pagamento recusado'
                    : isCheckingExpiration
                      ? 'Confirmando prazo'
                    : 'Lugares reservados'}
            </p>
            <h1>{reservation.session.movie.title}</h1>
            <p className="reservation-lead">
              {isExpired
                ? 'O prazo terminou e os lugares foram liberados para a sala.'
                : isPaid
                  ? 'Pagamento simulado aprovado. Seus ingressos foram emitidos.'
                  : isCancelled
                    ? 'Pagamento simulado recusado. Nenhum ingresso foi emitido e os lugares foram liberados.'
                    : isCheckingExpiration
                      ? 'O contador chegou a zero. Estamos confirmando o estado da reserva com o servidor.'
                      : deadlineReachedLocally
                        ? 'O servidor confirmará o prazo antes de processar qualquer ação.'
                    : 'Seus lugares estão protegidos temporariamente. O servidor confirma o prazo abaixo.'}
            </p>

            <dl className="reservation-facts">
              <div>
                <dt>Data</dt>
                <dd>{formatSessionDay(reservation.session.startsAt)}</dd>
              </div>
              <div>
                <dt>Horário</dt>
                <dd>{formatSessionTime(reservation.session.startsAt)}</dd>
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

        <aside
          className={`reservation-timer ${isPending ? `timer-${countdownState}` : ''}`.trim()}
          role={isPending && !isCheckingExpiration ? 'timer' : 'status'}
          aria-live={isPending && !isCheckingExpiration ? 'off' : 'polite'}
        >
          <span className="reservation-status-icon" aria-hidden="true">
            {isExpired
              ? '⌛'
              : isPaid
                ? '✓'
                : isCancelled
                  ? '×'
                  : isCheckingExpiration
                    ? '…'
                    : '◷'}
          </span>
          <span>
            {isCheckingExpiration
              ? 'Confirmando prazo'
              : isPending
                ? 'Tempo restante'
                : 'Status'}
          </span>
          <strong>
            {isExpired
              ? 'EXPIRADA'
              : isPaid
                ? 'APROVADO'
                : isCancelled
                  ? 'RECUSADO'
                  : isCheckingExpiration
                    ? 'AGUARDE'
                  : formatRemainingTime(remainingMilliseconds)}
          </strong>
          {isPending ? (
            <div className="reservation-progress" aria-hidden="true">
              <span style={{ width: `${progressPercentage}%` }} />
            </div>
          ) : null}
          <p>
            {isExpired
              ? 'Escolha os lugares novamente para criar uma nova reserva.'
              : isPaid
                ? 'Seus lugares permanecem reservados e os ingressos já estão disponíveis.'
                : isCancelled
                  ? 'Você pode voltar à sessão e escolher lugares disponíveis.'
                  : isCheckingExpiration
                    ? 'Aguarde a confirmação do servidor antes de continuar.'
                    : deadlineReachedLocally
                      ? 'O servidor ainda é a autoridade sobre a validade desta reserva.'
                      : countdownState === 'critical'
                        ? 'Último minuto para concluir o pagamento simulado.'
                        : countdownState === 'warning'
                          ? 'Restam menos de dois minutos para concluir.'
                  : 'Escolha abaixo qual resultado de pagamento deseja demonstrar.'}
          </p>
        </aside>
      </article>

      {errorMessage ? (
        <p className="message error-message" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {isExpired || isCancelled ? (
        <button
          type="button"
          onClick={() => onBackToSession(reservation.session.id)}
        >
          {isCancelled ? 'Voltar à sessão' : 'Escolher lugares novamente'}
        </button>
      ) : isPaid ? (
        <div className="payment-result-actions">
          {issuedTicketId ? (
            <button type="button" onClick={() => onOpenTicket(issuedTicketId)}>
              Ver meu ingresso
            </button>
          ) : null}
          <button type="button" className="secondary-button" onClick={onOpenTickets}>
            Meus ingressos
          </button>
        </div>
      ) : (
        <section className="payment-simulator" aria-labelledby="payment-heading">
          <div>
            <p className="section-kicker">Bilheteria · demonstração</p>
            <h2 id="payment-heading">Escolha o resultado do pagamento</h2>
            <p>
              Pagamento totalmente simulado: nenhum cartão é solicitado e
              nenhuma cobrança real será feita.
            </p>
          </div>
          <div className="payment-buttons">
            <button
              type="button"
              onClick={() => void simulatePayment('APPROVED')}
              disabled={
                paymentAction !== null || isCheckingExpiration || isSynchronizing
              }
            >
              {isSynchronizing
                ? 'Sincronizando…'
                : paymentAction === 'APPROVED'
                  ? 'Aprovando…'
                  : 'Aprovar pagamento'}
            </button>
            <button
              type="button"
              className="secondary-button decline-button"
              onClick={() => void simulatePayment('DECLINED')}
              disabled={
                paymentAction !== null || isCheckingExpiration || isSynchronizing
              }
            >
              {isSynchronizing
                ? 'Sincronizando…'
                : paymentAction === 'DECLINED'
                  ? 'Recusando…'
                  : 'Recusar pagamento'}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
