import { useEffect, useState } from 'react'
import {
  ApiError,
  getMyTickets,
  type TicketSummary,
} from '../../api'
import {
  formatSessionDate,
  tmdbPosterUrl,
} from '../organizer/formatters'

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
  const [tickets, setTickets] = useState<TicketSummary[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    getMyTickets(accessToken, controller.signal)
      .then((result) => {
        setTickets(result)
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
          <span className="empty-ticket" aria-hidden="true">E</span>
          <h2>Nenhum ingresso por aqui.</h2>
          <p>Escolha uma sessão, reserve seus lugares e aprove o pagamento simulado.</p>
          <button type="button" onClick={onBack}>Ver programação</button>
        </div>
      ) : (
        <div className="my-ticket-list">
          {tickets.map((ticket) => {
            const posterUrl = tmdbPosterUrl(ticket.session.movie.posterPath)

            return (
              <article className="my-ticket-card" key={ticket.id}>
                {posterUrl ? (
                  <img
                    src={posterUrl}
                    alt={`Pôster de ${ticket.session.movie.title}`}
                  />
                ) : (
                  <div className="ticket-poster-placeholder" aria-hidden="true">E</div>
                )}
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
                      {ticket.status === 'VALID' ? 'Válido' : 'Utilizado'}
                    </span>
                    <button type="button" onClick={() => onOpenTicket(ticket.id)}>
                      Abrir ingresso
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
