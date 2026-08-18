import { lazy, Suspense } from 'react'
import type { TicketStatus } from '../../api'
import {
  formatSessionDate,
  tmdbPosterUrl,
} from '../organizer/formatters'

const QRCodeSVG = lazy(() =>
  import('qrcode.react').then((module) => ({ default: module.QRCodeSVG })),
)

export interface DigitalTicketData {
  status: TicketStatus
  manualCode: string
  qrToken: string
  seatLabel: string
  session: {
    startsAt: string
    venueName: string
    roomName: string
    address: string
    movie: {
      title: string
      posterPath: string | null
    }
  }
}

interface DigitalTicketProps {
  ticket: DigitalTicketData
  shared?: boolean
}

export function DigitalTicket({ ticket, shared = false }: DigitalTicketProps) {
  const posterUrl = tmdbPosterUrl(ticket.session.movie.posterPath)
  const statusLabel = ticket.status === 'VALID' ? 'Válido' : 'Utilizado'

  return (
    <article
      className={`digital-ticket ticket-status-${ticket.status.toLowerCase()}`}
      aria-label={`Ingresso para ${ticket.session.movie.title}, assento ${ticket.seatLabel}`}
    >
      <div className="digital-ticket-details">
        <div className="ticket-movie">
          {posterUrl ? (
            <img
              src={posterUrl}
              alt={`Pôster de ${ticket.session.movie.title}`}
            />
          ) : (
            <div className="ticket-poster-placeholder" aria-hidden="true">
              E
            </div>
          )}
          <div>
            <p className="section-kicker">
              {shared ? 'Ingresso compartilhado' : 'Seu ingresso digital'}
            </p>
            <h1>{ticket.session.movie.title}</h1>
            <span className="ticket-status-badge">{statusLabel}</span>
          </div>
        </div>

        <dl className="ticket-facts">
          <div>
            <dt>Data e horário</dt>
            <dd>{formatSessionDate(ticket.session.startsAt)}</dd>
          </div>
          <div>
            <dt>Cinema</dt>
            <dd>{ticket.session.venueName}</dd>
          </div>
          <div>
            <dt>Sala</dt>
            <dd>{ticket.session.roomName}</dd>
          </div>
          <div className="ticket-seat-fact">
            <dt>Assento</dt>
            <dd>{ticket.seatLabel}</dd>
          </div>
          <div className="ticket-address-fact">
            <dt>Endereço</dt>
            <dd>{ticket.session.address}</dd>
          </div>
        </dl>
      </div>

      <div className="ticket-perforation" aria-hidden="true">
        <span />
      </div>

      <div className="ticket-admission">
        <div
          className="ticket-qr"
          role="img"
          aria-label={`QR Code do ingresso, assento ${ticket.seatLabel}`}
        >
          <Suspense fallback={<span className="qr-loading">Gerando QR…</span>}>
            <QRCodeSVG
              value={ticket.qrToken}
              size={224}
              level="M"
              marginSize={2}
              bgColor="#fffdf7"
              fgColor="#141210"
              title={`Ingresso ${ticket.seatLabel}`}
            />
          </Suspense>
        </div>
        <p>Apresente o QR Code ou informe o código manual na portaria.</p>
        <strong className="manual-code" aria-label={`Código manual ${ticket.manualCode}`}>
          {ticket.manualCode}
        </strong>
      </div>
    </article>
  )
}
