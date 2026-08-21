import { QRCodeSVG } from 'qrcode.react'
import type { TicketStatus } from '../../api'
import {
  formatSessionDate,
  tmdbPosterUrl,
} from '../organizer/formatters'
import { BrandLockup } from '../common/BrandLockup'
import { PosterImage } from '../common/PosterImage'
import { useToast } from '../common/toast'

export interface DigitalTicketData {
  status: TicketStatus
  manualCode: string | null
  qrToken: string | null
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
  const { notify } = useToast()
  const posterUrl = tmdbPosterUrl(ticket.session.movie.posterPath)
  const statusLabels: Record<TicketStatus, string> = {
    VALID: 'Válido',
    USED: 'Utilizado',
    CANCELLED: 'Cancelado',
  }
  const statusLabel = statusLabels[ticket.status]
  const { manualCode, qrToken } = ticket

  async function copyManualCode() {
    if (manualCode === null) {
      return
    }

    if (!navigator.clipboard) {
      notify('Selecione o código para copiá-lo manualmente.', 'info')
      return
    }

    try {
      await navigator.clipboard.writeText(manualCode)
      notify('Código copiado.', 'success')
    } catch {
      notify('Não foi possível copiar o código automaticamente.', 'error')
    }
  }

  return (
    <article
      className={`digital-ticket ticket-status-${ticket.status.toLowerCase()}`}
      aria-label={`Ingresso para ${ticket.session.movie.title}, assento ${ticket.seatLabel}`}
    >
      <div className="digital-ticket-details">
        <div className="ticket-branding">
          <BrandLockup />
          <span>{shared ? 'Ingresso compartilhado' : 'Ingresso digital'}</span>
        </div>
        <div className="ticket-movie">
          <PosterImage
            src={posterUrl}
            title={ticket.session.movie.title}
            className="ticket-poster"
            variant="ticket"
          />
          <div className="ticket-movie-copy">
            <h1>{ticket.session.movie.title}</h1>
            <span className="ticket-status-badge">{statusLabel}</span>
          </div>
        </div>

        <dl className="ticket-facts">
          <div className="ticket-seat-fact">
            <dt>Assento</dt>
            <dd>{ticket.seatLabel}</dd>
          </div>
          <div>
            <dt>Data e horário</dt>
            <dd>
              <time dateTime={ticket.session.startsAt}>
                {formatSessionDate(ticket.session.startsAt)}
              </time>
            </dd>
          </div>
          <div>
            <dt>Cinema</dt>
            <dd>{ticket.session.venueName}</dd>
          </div>
          <div>
            <dt>Sala</dt>
            <dd>{ticket.session.roomName}</dd>
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

      {ticket.status === 'CANCELLED' ? (
        <div className="ticket-admission ticket-admission-cancelled" role="status">
          <span className="ticket-admission-label">Credencial cancelada</span>
          <strong className="ticket-cancelled-title">Cancelado</strong>
          <p>
            Este ingresso não concede acesso. O assento voltou a ficar
            disponível para outra compra.
          </p>
        </div>
      ) : manualCode !== null && qrToken !== null ? (
        <div className="ticket-admission">
          <span className="ticket-admission-label">Apresente na portaria</span>
          <span className="ticket-admission-status">{statusLabel}</span>
          <div
            className="ticket-qr"
            role="img"
            aria-label={`QR Code do ingresso, assento ${ticket.seatLabel}`}
          >
            <QRCodeSVG
              value={qrToken}
              size={256}
              level="M"
              marginSize={4}
              bgColor="#ffffff"
              fgColor="#111111"
              title={`Ingresso ${ticket.seatLabel}`}
            />
          </div>
          <span className="manual-code-label">Código manual</span>
          <strong
            className="manual-code"
            aria-label={`Código manual ${manualCode}`}
          >
            {manualCode}
          </strong>
          <button
            type="button"
            className="ticket-copy-code"
            onClick={() => void copyManualCode()}
          >
            Copiar código
          </button>
        </div>
      ) : (
        <div className="ticket-admission ticket-admission-cancelled" role="status">
          <span className="ticket-admission-label">Credencial indisponível</span>
          <strong className="ticket-cancelled-title">Indisponível</strong>
          <p>Não foi possível carregar os dados de acesso deste ingresso.</p>
        </div>
      )}
    </article>
  )
}
