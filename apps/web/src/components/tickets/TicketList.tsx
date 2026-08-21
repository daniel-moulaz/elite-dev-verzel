import { useEffect, useRef, useState } from 'react'
import {
  ApiError,
  cancelReservation,
  getMyTickets,
  type TicketSummary,
} from '../../api'
import {
  formatSessionDate,
  tmdbPosterUrl,
} from '../organizer/formatters'
import { PosterImage } from '../common/PosterImage'
import { useToast } from '../common/toast'

interface TicketGroup {
  reservation: TicketSummary['reservation']
  tickets: TicketSummary[]
}

const ticketStatusLabels: Record<TicketSummary['status'], string> = {
  VALID: 'Válido',
  USED: 'Utilizado',
  CANCELLED: 'Cancelado',
}

function groupTicketsByReservation(tickets: TicketSummary[]): TicketGroup[] {
  const groups = new Map<string, TicketGroup>()

  for (const ticket of tickets) {
    const group = groups.get(ticket.reservation.id)

    if (group) {
      group.tickets.push(ticket)
      group.reservation.canCancel =
        group.reservation.canCancel && ticket.reservation.canCancel
      continue
    }

    groups.set(ticket.reservation.id, {
      reservation: { ...ticket.reservation },
      tickets: [ticket],
    })
  }

  return [...groups.values()]
}

function ticketCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'ingresso' : 'ingressos'}`
}

interface TicketListProps {
  accessToken: string
  onBack: () => void
  onOpenTicket: (ticketId: string) => void
}

export function TicketList({
  accessToken,
  onBack,
  onOpenTicket,
}: TicketListProps) {
  const { notify } = useToast()
  const [tickets, setTickets] = useState<TicketSummary[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [cancellingReservationId, setCancellingReservationId] = useState<string | null>(null)
  const cancellationLockRef = useRef(false)

  useEffect(() => {
    const controller = new AbortController()

    getMyTickets(accessToken, controller.signal)
      .then((result) => {
        setTickets(result)
        setErrorMessage('')
        setStatus('ready')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        setErrorMessage(
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar seus ingressos.',
        )
        setStatus('error')
      })

    return () => controller.abort()
  }, [accessToken, reloadKey])

  function retry() {
    setStatus('loading')
    setErrorMessage('')
    setReloadKey((value) => value + 1)
  }

  async function cancelPurchase(group: TicketGroup) {
    if (!group.reservation.canCancel || cancellationLockRef.current) {
      return
    }

    const count = group.reservation.ticketCount
    const confirmed = window.confirm(
      `Você está cancelando a compra inteira. Todos os ingressos desta compra (${ticketCountLabel(count)}) serão cancelados. `
      + 'Os assentos voltarão a ficar disponíveis imediatamente. '
      + 'Como o pagamento é simulado, não haverá estorno financeiro real. Deseja continuar?',
    )

    if (!confirmed) {
      return
    }

    cancellationLockRef.current = true
    setCancellingReservationId(group.reservation.id)

    try {
      const result = await cancelReservation(accessToken, group.reservation.id)
      const cancelledTicketIds = new Set(result.tickets.map((ticket) => ticket.id))

      setTickets((current) => current.map((ticket) =>
        cancelledTicketIds.has(ticket.id)
          ? {
              ...ticket,
              status: 'CANCELLED',
              manualCode: null,
              reservation: {
                ...ticket.reservation,
                status: 'CANCELLED',
                canCancel: false,
              },
            }
          : ticket,
      ))
      setReloadKey((value) => value + 1)
      notify(
        `Compra cancelada. ${ticketCountLabel(count)} e seus assentos foram liberados.`,
        'success',
      )
    } catch (error) {
      notify(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível cancelar esta compra.',
        'error',
      )

      // A falha pode ter ocorrido depois do commit e antes da resposta chegar.
      // Sempre reconcilie o snapshot local com o PostgreSQL antes de liberar a UX.
      setStatus('loading')
      setErrorMessage('')
      setReloadKey((value) => value + 1)
    } finally {
      cancellationLockRef.current = false
      setCancellingReservationId(null)
    }
  }

  if (status === 'loading') {
    return (
      <div className="public-content">
        <div className="content-state public-state" aria-busy="true" aria-live="polite">
          <p className="section-kicker">Bilheteria</p>
          <h1>Buscando seus ingressos…</h1>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="public-content">
        <div className="content-state public-state" role="alert">
          <p className="section-kicker">Meus ingressos</p>
          <h1>Não foi possível abrir sua bilheteria.</h1>
          <p>{errorMessage}</p>
          <div className="button-row">
            <button type="button" className="secondary-button" onClick={onBack}>
              Ver programação
            </button>
            <button type="button" onClick={retry}>Tentar novamente</button>
          </div>
        </div>
      </div>
    )
  }

  const ticketGroups = groupTicketsByReservation(tickets)

  return (
    <div className="public-content tickets-page">
      <button type="button" className="back-button" onClick={onBack}>
        <span aria-hidden="true">←</span> Voltar à programação
      </button>
      <div className="page-heading tickets-heading">
        <div>
          <p className="section-kicker">Bilheteria pessoal</p>
          <h1>Meus ingressos</h1>
          <p>Ingressos emitidos após pagamentos simulados aprovados.</p>
        </div>
      </div>

      {tickets.length === 0 ? (
        <div className="content-state public-state empty-state">
          <span className="empty-ticket" aria-hidden="true">S</span>
          <h2>Nenhum ingresso por aqui.</h2>
          <p>Escolha uma sessão, reserve seus lugares e aprove o pagamento simulado.</p>
          <button type="button" onClick={onBack}>Ver programação</button>
        </div>
      ) : (
        <div className="ticket-purchase-list">
          {ticketGroups.map((group) => (
            <section
              className="ticket-purchase-group"
              key={group.reservation.id}
              aria-label={`Compra com ${ticketCountLabel(group.reservation.ticketCount)}`}
            >
              <header className="ticket-purchase-heading">
                <div>
                  <p className="section-kicker">Compra</p>
                  <p className="ticket-purchase-summary">
                    {ticketCountLabel(group.reservation.ticketCount)} ·{' '}
                    {group.tickets.length === 1 ? 'Assento' : 'Assentos'}{' '}
                    {group.tickets.map((ticket) => ticket.seat.label).join(', ')}
                  </p>
                </div>
                {group.reservation.canCancel ? (
                  <button
                    type="button"
                    className="danger-text-button"
                    onClick={() => void cancelPurchase(group)}
                    disabled={cancellingReservationId !== null}
                  >
                    {cancellingReservationId === group.reservation.id
                      ? 'Cancelando compra…'
                      : 'Cancelar compra'}
                  </button>
                ) : group.reservation.status === 'CANCELLED' ? (
                  <span className="ticket-purchase-state">Compra cancelada</span>
                ) : null}
              </header>

              <div className="my-ticket-list">
                {group.tickets.map((ticket) => {
                  const posterUrl = tmdbPosterUrl(ticket.session.movie.posterPath)
                  const isCancelled = ticket.status === 'CANCELLED'

                  return (
                    <article className="my-ticket-card" key={ticket.id}>
                      <PosterImage
                        src={posterUrl}
                        title={ticket.session.movie.title}
                        className="my-ticket-poster"
                        loading="lazy"
                      />
                      <div className="my-ticket-card-body">
                        <div>
                          <p className="section-kicker">Assento {ticket.seat.label}</p>
                          <h2>{ticket.session.movie.title}</h2>
                        </div>
                        <dl>
                          <div>
                            <dt>Sessão</dt>
                            <dd>{formatSessionDate(ticket.session.startsAt)}</dd>
                          </div>
                          <div>
                            <dt>Local</dt>
                            <dd>{ticket.session.venueName}, {ticket.session.roomName}</dd>
                          </div>
                        </dl>
                        <div className="ticket-card-footer">
                          <span className={`ticket-status-badge ticket-status-${ticket.status.toLowerCase()}`}>
                            {ticketStatusLabels[ticket.status]}
                          </span>
                          <button
                            type="button"
                            onClick={() => onOpenTicket(ticket.id)}
                            aria-label={`${isCancelled ? 'Ver detalhes do' : 'Abrir'} ingresso para ${ticket.session.movie.title}, assento ${ticket.seat.label}`}
                          >
                            {isCancelled ? 'Ver detalhes' : 'Abrir ingresso'}
                          </button>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
