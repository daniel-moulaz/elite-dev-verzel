import { useEffect, useRef, useState } from 'react'
import {
  ApiError,
  cancelTicket,
  createTicketShareLink,
  getMyTicket,
  revokeTicketShareLink,
  type ShareLinkResult,
  type TicketDetail as TicketDetailData,
} from '../../api'
import { createCalendarFile, downloadCalendarFile } from '../../calendar'
import { DigitalTicket } from './DigitalTicket'
import { useToast } from '../common/toast'

interface ShareFeedback {
  type: 'error'
  message: string
}

interface TicketDetailProps {
  accessToken: string
  ticketId: string
  onBack: () => void
}

type ShareAction = 'idle' | 'creating' | 'copying' | 'sharing' | 'revoking'

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
  const { notify } = useToast()
  const [ticket, setTicket] = useState<TicketDetailData | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [shareLink, setShareLink] = useState<ShareLinkResult | null>(null)
  const [shareFeedback, setShareFeedback] = useState<ShareFeedback | null>(null)
  const [shareAction, setShareAction] = useState<ShareAction>('idle')
  const [reloadKey, setReloadKey] = useState(0)
  const [isCancellingTicket, setIsCancellingTicket] = useState(false)
  const shareActionLockRef = useRef(false)
  const cancelActionLockRef = useRef(false)

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

  function beginShareAction(action: Exclude<ShareAction, 'idle'>): boolean {
    if (shareActionLockRef.current) {
      return false
    }

    shareActionLockRef.current = true
    setShareAction(action)
    return true
  }

  function finishShareAction() {
    shareActionLockRef.current = false
    setShareAction('idle')
  }

  async function generateShareLink() {
    if (
      ticket?.status === 'CANCELLED' ||
      shareActionLockRef.current ||
      cancelActionLockRef.current
    ) {
      return
    }

    if (
      (ticket?.shareLink || shareLink) &&
      !window.confirm(
        'Gerar um novo link invalida imediatamente o compartilhamento anterior. Deseja continuar?',
      )
    ) {
      return
    }

    if (!beginShareAction('creating')) {
      return
    }

    setShareFeedback(null)

    try {
      const result = await createTicketShareLink(accessToken, ticketId)
      setShareLink(result)
      setTicket((current) =>
        current
          ? { ...current, shareLink: { expiresAt: result.expiresAt } }
          : current,
      )
      notify('Link de compartilhamento criado.', 'success')
    } catch (error) {
      setShareFeedback({
        type: 'error',
        message: error instanceof ApiError
          ? error.message
          : 'Não foi possível gerar o link.',
      })
    } finally {
      finishShareAction()
    }
  }

  async function copyShareLink() {
    if (!shareLink || !beginShareAction('copying')) {
      return
    }

    setShareFeedback(null)

    try {
      if (!navigator.clipboard) {
        notify('Selecione o endereço para copiá-lo manualmente.', 'info')
        return
      }

      await navigator.clipboard.writeText(shareLink.url)
      notify('Link copiado.', 'success')
    } catch {
      setShareFeedback({
        type: 'error',
        message: 'Não foi possível copiar automaticamente. Copie o endereço abaixo.',
      })
    } finally {
      finishShareAction()
    }
  }

  async function shareTicket() {
    if (!shareLink || shareActionLockRef.current) {
      return
    }

    setShareFeedback(null)

    if (typeof navigator.share !== 'function') {
      await copyShareLink()
      return
    }

    if (!beginShareAction('sharing')) {
      return
    }

    try {
      await navigator.share({
        title: `Ingresso SEPTEM — ${ticket?.session.movie.title ?? 'cinema'}`,
        text: 'Acesse este ingresso compartilhado da SEPTEM.',
        url: shareLink.url,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }

      setShareFeedback({
        type: 'error',
        message: 'Não foi possível abrir o compartilhamento do dispositivo.',
      })
    } finally {
      finishShareAction()
    }
  }

  async function revokeShareLink() {
    if (shareActionLockRef.current || cancelActionLockRef.current) {
      return
    }

    if (
      !window.confirm(
        'Revogar este link impede imediatamente novos acessos por ele. Deseja continuar?',
      )
    ) {
      return
    }

    if (!beginShareAction('revoking')) {
      return
    }

    setShareFeedback(null)

    try {
      await revokeTicketShareLink(accessToken, ticketId)
      setShareLink(null)
      setTicket((current) =>
        current ? { ...current, shareLink: null } : current,
      )
      notify('Link revogado.', 'success')
    } catch (error) {
      setShareFeedback({
        type: 'error',
        message: error instanceof ApiError
          ? error.message
          : 'Não foi possível revogar o link.',
      })
    } finally {
      finishShareAction()
    }
  }

  async function cancelThisTicket() {
    if (
      !ticket ||
      ticket.status !== 'VALID' ||
      !ticket.canCancel ||
      cancelActionLockRef.current ||
      shareActionLockRef.current
    ) {
      return
    }

    const confirmed = window.confirm(
      'Este ingresso será cancelado e o assento voltará a ficar disponível. '
      + 'Os demais ingressos desta compra não são afetados. '
      + 'Como o pagamento é simulado, não haverá estorno financeiro real. Deseja continuar?',
    )

    if (!confirmed) {
      return
    }

    cancelActionLockRef.current = true
    setIsCancellingTicket(true)

    try {
      await cancelTicket(accessToken, ticketId)
      setTicket((current) =>
        current
          ? { ...current, status: 'CANCELLED', manualCode: null, qrToken: null }
          : current,
      )
      notify('Ingresso cancelado. O assento voltou a ficar disponível.', 'success')
      setReloadKey((value) => value + 1)
    } catch (error) {
      notify(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível cancelar este ingresso.',
        'error',
      )
      setReloadKey((value) => value + 1)
    } finally {
      cancelActionLockRef.current = false
      setIsCancellingTicket(false)
    }
  }

  function addTicketToCalendar() {
    if (!ticket) {
      return
    }

    try {
      downloadCalendarFile(
        createCalendarFile({
          id: ticket.session.id,
          movieTitle: ticket.session.movie.title,
          startsAt: ticket.session.startsAt,
          venueName: ticket.session.venueName,
          roomName: ticket.session.roomName,
          address: ticket.session.address,
        }),
      )
      notify('Arquivo da agenda preparado.', 'success')
    } catch {
      notify('Não foi possível preparar o arquivo da agenda.', 'error')
    }
  }

  if (status === 'loading') {
    return (
      <div className="public-content ticket-detail-loading">
        <div className="ticket-skeleton" aria-busy="true" aria-live="polite">
          <p className="section-kicker">Ingresso digital</p>
          <h1 className="visually-hidden">Preparando seu bilhete…</h1>
          <div aria-hidden="true"><span /><span /><span /></div>
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
      <div className="ticket-detail-toolbar">
        <button type="button" className="back-button" onClick={onBack}>
          <span aria-hidden="true">←</span> Meus ingressos
        </button>
        <div
          className="ticket-utility-actions"
          role="group"
          aria-label="Ações do ingresso"
        >
          <button
            type="button"
            className="secondary-button"
            onClick={addTicketToCalendar}
          >
            Adicionar à agenda
          </button>
          <button
            type="button"
            className="secondary-button ticket-print-button"
            onClick={() => window.print()}
          >
            Imprimir / salvar
          </button>
          {ticket.status === 'VALID' && ticket.canCancel ? (
            <button
              type="button"
              className="danger-text-button"
              onClick={() => void cancelThisTicket()}
              disabled={isCancellingTicket || shareAction !== 'idle'}
            >
              {isCancellingTicket ? 'Cancelando…' : 'Cancelar ingresso'}
            </button>
          ) : null}
        </div>
      </div>

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
            {ticket.status === 'CANCELLED'
              ? 'Este ingresso está cancelado. Links já emitidos continuam informando o cancelamento, sem exibir uma credencial utilizável.'
              : 'O link exibe este ingresso sem seu nome ou e-mail. Um novo link invalida o anterior.'}
          </p>
        </div>

        {shareLink && ticket.status !== 'CANCELLED' ? (
          <div className="share-link-result">
            <label htmlFor="share-url">Link compartilhável</label>
            <div>
              <input id="share-url" readOnly value={shareLink.url} />
              <button
                type="button"
                onClick={() => void copyShareLink()}
                disabled={shareAction !== 'idle' || isCancellingTicket}
              >
                {shareAction === 'copying' ? 'Copiando…' : 'Copiar'}
              </button>
            </div>
            <div className="share-link-actions">
              {typeof navigator.share === 'function' ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void shareTicket()}
                  disabled={shareAction !== 'idle' || isCancellingTicket}
                >
                  {shareAction === 'sharing'
                    ? 'Compartilhando…'
                    : 'Compartilhar'}
                </button>
              ) : null}
              {shareAction === 'idle' ? (
                <a
                  className="secondary-link-button"
                  href={shareLink.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir link
                </a>
              ) : (
                <span
                  className="secondary-link-button is-disabled"
                  aria-disabled="true"
                >
                  Abrir link
                </span>
              )}
            </div>
            <small>Expira em {shareExpirationLabel(shareLink.expiresAt)}.</small>
          </div>
        ) : ticket.shareLink ? (
          <p className="active-share-note">
            {ticket.status === 'CANCELLED' ? (
              <>
                Há um link ativo até {shareExpirationLabel(ticket.shareLink.expiresAt)}.
                Ele mostra este ingresso como cancelado e pode ser revogado abaixo.
              </>
            ) : (
              <>
                Há um link ativo até {shareExpirationLabel(ticket.shareLink.expiresAt)}.
                Gere um novo para obter outra URL; o link anterior será invalidado.
              </>
            )}
          </p>
        ) : null}

        {shareFeedback ? (
          <p
            className={`message share-message share-${shareFeedback.type}`}
            role="alert"
          >
            {shareFeedback.message}
          </p>
        ) : null}

        <div className="share-actions">
          {ticket.status !== 'CANCELLED' ? (
            <button
              type="button"
              onClick={() => void generateShareLink()}
              disabled={shareAction !== 'idle' || isCancellingTicket}
            >
              {shareAction === 'creating'
                ? 'Gerando…'
                : ticket.shareLink
                  ? 'Gerar novo link'
                  : 'Gerar link'}
            </button>
          ) : null}
          {ticket.shareLink ? (
            <button
              type="button"
              className="danger-text-button"
              onClick={() => void revokeShareLink()}
              disabled={shareAction !== 'idle' || isCancellingTicket}
            >
              {shareAction === 'revoking' ? 'Revogando…' : 'Revogar link'}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  )
}
