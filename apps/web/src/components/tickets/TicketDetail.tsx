import { useEffect, useState } from 'react'
import {
  ApiError,
  createTicketShareLink,
  getMyTicket,
  revokeTicketShareLink,
  type ShareLinkResult,
  type TicketDetail as TicketDetailData,
} from '../../api'
import { DigitalTicket } from './DigitalTicket'

interface TicketDetailProps {
  accessToken: string
  ticketId: string
  onBack: () => void
}

function shareExpirationLabel(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function TicketDetail({
  accessToken,
  ticketId,
  onBack,
}: TicketDetailProps) {
  const [ticket, setTicket] = useState<TicketDetailData | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [shareLink, setShareLink] = useState<ShareLinkResult | null>(null)
  const [shareMessage, setShareMessage] = useState('')
  const [shareAction, setShareAction] = useState<'idle' | 'creating' | 'revoking'>('idle')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    getMyTicket(accessToken, ticketId, controller.signal)
      .then((result) => {
        setTicket(result)
        setStatus('ready')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        setErrorMessage(
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar este ingresso.',
        )
        setStatus('error')
      })

    return () => controller.abort()
  }, [accessToken, reloadKey, ticketId])

  function retry() {
    setStatus('loading')
    setErrorMessage('')
    setReloadKey((value) => value + 1)
  }

  async function generateShareLink() {
    setShareAction('creating')
    setShareMessage('')

    try {
      const result = await createTicketShareLink(accessToken, ticketId)
      setShareLink(result)
      setTicket((current) =>
        current
          ? { ...current, shareLink: { expiresAt: result.expiresAt } }
          : current,
      )
      setShareMessage(
        'Link criado. Gerar outro link invalida este imediatamente.',
      )
    } catch (error) {
      setShareMessage(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível gerar o link.',
      )
    } finally {
      setShareAction('idle')
    }
  }

  async function copyShareLink() {
    if (!shareLink) {
      return
    }

    if (!navigator.clipboard) {
      setShareMessage('Copie o endereço exibido abaixo.')
      return
    }

    try {
      await navigator.clipboard.writeText(shareLink.url)
      setShareMessage('Link copiado para a área de transferência.')
    } catch {
      setShareMessage('Não foi possível copiar automaticamente. Copie o endereço abaixo.')
    }
  }

  async function revokeShareLink() {
    setShareAction('revoking')
    setShareMessage('')

    try {
      await revokeTicketShareLink(accessToken, ticketId)
      setShareLink(null)
      setTicket((current) =>
        current ? { ...current, shareLink: null } : current,
      )
      setShareMessage('Link revogado. Ele não pode mais abrir o ingresso.')
    } catch (error) {
      setShareMessage(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível revogar o link.',
      )
    } finally {
      setShareAction('idle')
    }
  }

  if (status === 'loading') {
    return (
      <div className="public-content">
        <div className="content-state public-state" aria-busy="true" aria-live="polite">
          <p className="section-kicker">Ingresso digital</p>
          <h1>Preparando seu bilhete…</h1>
        </div>
      </div>
    )
  }

  if (status === 'error' || !ticket) {
    return (
      <div className="public-content">
        <div className="content-state public-state" role="alert">
          <p className="section-kicker">Ingresso indisponível</p>
          <h1>Não foi possível abrir este ingresso.</h1>
          <p>{errorMessage}</p>
          <div className="button-row">
            <button type="button" className="secondary-button" onClick={onBack}>
              Meus ingressos
            </button>
            <button type="button" onClick={retry}>Tentar novamente</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="public-content ticket-detail-page">
      <button type="button" className="back-button" onClick={onBack}>
        <span aria-hidden="true">←</span> Meus ingressos
      </button>

      <DigitalTicket
        ticket={{
          status: ticket.status,
          manualCode: ticket.manualCode,
          qrToken: ticket.qrToken,
          seatLabel: ticket.seat.label,
          session: ticket.session,
        }}
      />

      <section className="ticket-sharing" aria-labelledby="share-heading">
        <div>
          <p className="section-kicker">Compartilhamento seguro</p>
          <h2 id="share-heading">Compartilhar ingresso</h2>
          <p>
            O link exibe este ingresso sem seu nome ou e-mail. Um novo link
            invalida o anterior.
          </p>
        </div>

        {shareLink ? (
          <div className="share-link-result">
            <label htmlFor="share-url">Link compartilhável</label>
            <div>
              <input id="share-url" readOnly value={shareLink.url} />
              <button type="button" onClick={() => void copyShareLink()}>
                Copiar
              </button>
            </div>
            <small>Expira em {shareExpirationLabel(shareLink.expiresAt)}.</small>
          </div>
        ) : ticket.shareLink ? (
          <p className="active-share-note">
            Existe um link ativo até {shareExpirationLabel(ticket.shareLink.expiresAt)}.
            Como o token não é armazenado em texto puro, gere outro para exibir uma nova URL.
          </p>
        ) : null}

        {shareMessage ? (
          <p className="message share-message" role="status">{shareMessage}</p>
        ) : null}

        <div className="share-actions">
          <button
            type="button"
            onClick={() => void generateShareLink()}
            disabled={shareAction !== 'idle'}
          >
            {shareAction === 'creating'
              ? 'Gerando…'
              : ticket.shareLink
                ? 'Gerar novo link'
                : 'Gerar link'}
          </button>
          {ticket.shareLink ? (
            <button
              type="button"
              className="danger-text-button"
              onClick={() => void revokeShareLink()}
              disabled={shareAction !== 'idle'}
            >
              {shareAction === 'revoking' ? 'Revogando…' : 'Revogar link'}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  )
}
