import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import {
  ApiError,
  consumeGateTicket,
  getGateSessions,
  type AuthenticatedUser,
  type GateConsumeResult,
  type GateSession,
} from '../../api'
import {
  formatSessionDate,
  tmdbPosterUrl,
} from '../organizer/formatters'
import { BrandLockup } from '../common/BrandLockup'
import { OfflineNotice } from '../common/OfflineNotice'
import { PosterImage } from '../common/PosterImage'
import { TmdbAttribution } from '../public/TmdbAttribution'
import { QrScanner } from './QrScanner'

interface GateAreaProps {
  accessToken: string
  user: AuthenticatedUser
  onLogout: () => void
}

type SessionsState =
  | { status: 'loading' }
  | { status: 'ready'; sessions: GateSession[] }
  | { status: 'error'; message: string }

const resultContent = {
  VALID: {
    icon: '✓',
    title: 'INGRESSO VÁLIDO',
    description: 'Ingresso válido e consumido agora.',
  },
  INVALID: {
    icon: '×',
    title: 'INGRESSO INVÁLIDO',
    description: 'Ingresso inválido. A credencial não foi reconhecida.',
  },
  ALREADY_USED: {
    icon: '!',
    title: 'INGRESSO JÁ UTILIZADO',
    description: 'Este ingresso já havia sido consumido nesta sessão.',
  },
  WRONG_EVENT: {
    icon: '↔',
    title: 'OUTRA SESSÃO',
    description: 'O ingresso não pertence à sessão selecionada. Não foi consumido.',
  },
} as const

function formatUsedAt(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value))
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
      ),
    )
  )
}

export function GateArea({ accessToken, user, onLogout }: GateAreaProps) {
  const [sessionsState, setSessionsState] = useState<SessionsState>({
    status: 'loading',
  })
  const [selectedSession, setSelectedSession] = useState<GateSession | null>(
    null,
  )
  const [manualCredential, setManualCredential] = useState('')
  const [consumeResult, setConsumeResult] =
    useState<GateConsumeResult | null>(null)
  const [validationError, setValidationError] = useState('')
  const [isValidating, setIsValidating] = useState(false)
  const [scannerPaused, setScannerPaused] = useState(false)
  const [scannerKey, setScannerKey] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)
  const [canUseFullscreen, setCanUseFullscreen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const validationInFlightRef = useRef(false)
  const gateShellRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const focusMainOnNextRenderRef = useRef(false)
  const scannerTitleRef = useRef<HTMLHeadingElement>(null)
  const manualInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (selectedSession && !consumeResult) {
      scannerTitleRef.current?.focus()
      return
    }

    if (!selectedSession && focusMainOnNextRenderRef.current) {
      focusMainOnNextRenderRef.current = false
      mainRef.current?.focus()
    }
  }, [consumeResult, scannerKey, selectedSession])

  useEffect(() => {
    const shell = gateShellRef.current

    if (!shell) {
      return
    }

    const fullscreenSupported =
      document.fullscreenEnabled &&
      typeof shell.requestFullscreen === 'function' &&
      typeof document.exitFullscreen === 'function'

    setCanUseFullscreen(fullscreenSupported)

    if (!fullscreenSupported) {
      return
    }

    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === shell)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)

      if (document.fullscreenElement === shell) {
        void document.exitFullscreen().catch(() => undefined)
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    getGateSessions(accessToken, controller.signal)
      .then((sessions) => setSessionsState({ status: 'ready', sessions }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        setSessionsState({
          status: 'error',
          message:
            error instanceof ApiError
              ? error.message
              : 'Não foi possível carregar as sessões da portaria.',
        })
      })

    return () => controller.abort()
  }, [accessToken, reloadKey])

  const validateCredential = useCallback(
    async (credential: string) => {
      if (
        !selectedSession ||
        validationInFlightRef.current ||
        consumeResult
      ) {
        return
      }

      const normalizedCredential = credential.trim()

      if (!normalizedCredential) {
        setValidationError('Informe o código manual antes de validar.')
        return
      }

      validationInFlightRef.current = true
      setIsValidating(true)
      setScannerPaused(true)
      setValidationError('')

      try {
        const result = await consumeGateTicket(
          accessToken,
          selectedSession.id,
          normalizedCredential,
        )
        setManualCredential('')
        setConsumeResult(result)
      } catch {
        setValidationError(
          'Não foi possível confirmar o resultado. Tente novamente; se o consumo já tiver sido concluído, a nova tentativa informará que o ingresso foi utilizado.',
        )
      } finally {
        validationInFlightRef.current = false
        setIsValidating(false)
      }
    },
    [accessToken, consumeResult, selectedSession],
  )

  function selectSession(session: GateSession) {
    setSelectedSession(session)
    setConsumeResult(null)
    setManualCredential('')
    setValidationError('')
    setScannerPaused(false)
    setScannerKey((value) => value + 1)
  }

  function changeSession() {
    focusMainOnNextRenderRef.current = true
    setSelectedSession(null)
    setConsumeResult(null)
    setManualCredential('')
    setValidationError('')
    setScannerPaused(true)
  }

  const validateNext = useCallback(() => {
    setConsumeResult(null)
    setManualCredential('')
    setValidationError('')
    setScannerPaused(false)
    setScannerKey((value) => value + 1)
  }, [])

  useEffect(() => {
    if (!consumeResult || isValidating || isFullscreen) {
      return
    }

    function handleResultShortcut(event: KeyboardEvent) {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        event.repeat ||
        isEditableTarget(event.target) ||
        document.fullscreenElement
      ) {
        return
      }

      event.preventDefault()
      validateNext()
    }

    window.addEventListener('keydown', handleResultShortcut)
    return () => window.removeEventListener('keydown', handleResultShortcut)
  }, [consumeResult, isFullscreen, isValidating, validateNext])

  function resumeScanner() {
    setValidationError('')
    setScannerPaused(false)
    setScannerKey((value) => value + 1)
  }

  function submitManualCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void validateCredential(manualCredential)
  }

  function reloadSessions() {
    setSessionsState({ status: 'loading' })
    setReloadKey((value) => value + 1)
  }

  function focusManualCode() {
    manualInputRef.current?.focus()
    manualInputRef.current?.scrollIntoView({
      behavior: 'auto',
      block: 'center',
    })
  }

  async function toggleFullscreen() {
    const shell = gateShellRef.current

    if (!shell || !canUseFullscreen) {
      return
    }

    try {
      if (document.fullscreenElement === shell) {
        await document.exitFullscreen()
      } else if (!document.fullscreenElement) {
        await shell.requestFullscreen()
      }
    } catch {
      // Fullscreen is progressive enhancement; the Gate remains operational.
    }
  }

  return (
    <div
      ref={gateShellRef}
      className={`gate-shell${isFullscreen ? ' is-fullscreen' : ''}`}
    >
      <OfflineNotice fullscreenOnly />
      <header className="gate-topbar">
        <div className="gate-brand">
          <BrandLockup context="Portaria" />
          <span className="gate-mode">Operação de acesso</span>
        </div>
        <div className="gate-account">
          <span>{user.name}</span>
          {canUseFullscreen ? (
            <button
              type="button"
              className="text-button gate-fullscreen-button"
              aria-pressed={isFullscreen}
              onClick={() => void toggleFullscreen()}
              disabled={isValidating}
            >
              {isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
            </button>
          ) : null}
          <button
            type="button"
            className="text-button"
            onClick={onLogout}
            disabled={isValidating}
          >
            Sair
          </button>
        </div>
      </header>

      <main
        id="main-content"
        ref={mainRef}
        className="gate-content"
        tabIndex={-1}
      >
        {!selectedSession ? (
          <section className="gate-session-step" aria-labelledby="gate-title">
            <div className="gate-heading">
              <div>
                <p className="section-kicker">Passo 1 de 2</p>
                <h1 id="gate-title">Selecione a sessão</h1>
                <p>
                  A sessão escolhida define o contexto da validação e impede
                  o consumo de ingressos de outra exibição.
                </p>
              </div>
            </div>

            {sessionsState.status === 'loading' ? (
              <div className="gate-state" aria-busy="true" aria-live="polite">
                <p>Carregando sessões publicadas…</p>
              </div>
            ) : sessionsState.status === 'error' ? (
              <div className="gate-state gate-error" role="alert">
                <h2>Não foi possível carregar as sessões.</h2>
                <p>{sessionsState.message}</p>
                <button type="button" onClick={reloadSessions}>
                  Tentar novamente
                </button>
              </div>
            ) : sessionsState.sessions.length === 0 ? (
              <div className="gate-state">
                <h2>Nenhuma sessão publicada</h2>
                <p>A portaria só opera sessões publicadas pelo organizador.</p>
              </div>
            ) : (
              <div className="gate-session-list">
                {sessionsState.sessions.map((session) => {
                  const posterUrl = tmdbPosterUrl(session.movie.posterPath)

                  return (
                    <button
                      key={session.id}
                      type="button"
                      className="gate-session-card"
                      onClick={() => selectSession(session)}
                    >
                      <PosterImage
                        src={posterUrl}
                        title={session.movie.title}
                        className="gate-session-poster"
                        decorative
                        loading="lazy"
                      />
                      <span className="gate-session-copy">
                        <span className="gate-session-time">
                          {formatSessionDate(session.startsAt)}
                        </span>
                        <strong>{session.movie.title}</strong>
                        <span>{session.venueName} · {session.roomName}</span>
                      </span>
                      <span className="gate-session-arrow" aria-hidden="true">→</span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        ) : (
          <section className="gate-scan-step" aria-labelledby="scanner-title">
            <div className="selected-gate-session">
              <div>
                <p className="section-kicker">Sessão selecionada</p>
                <h1 id="scanner-title" ref={scannerTitleRef} tabIndex={-1}>
                  {selectedSession.movie.title}
                </h1>
                <p>
                  {formatSessionDate(selectedSession.startsAt)} ·{' '}
                  {selectedSession.venueName} · {selectedSession.roomName}
                </p>
              </div>
              <div className="gate-session-actions">
                {!consumeResult ? (
                  <button
                    type="button"
                    className="secondary-button gate-manual-shortcut"
                    aria-controls="manual-code"
                    onClick={focusManualCode}
                    disabled={isValidating}
                  >
                    Digitar código
                  </button>
                ) : null}
                <button
                  type="button"
                  className="secondary-button"
                  onClick={changeSession}
                  disabled={isValidating}
                >
                  Trocar sessão
                </button>
              </div>
            </div>

            {consumeResult ? (
              <GateResult
                result={consumeResult}
                selectedSession={selectedSession}
                onNext={validateNext}
                onChangeSession={changeSession}
              />
            ) : (
              <div className="gate-validation-grid">
                <QrScanner
                  key={scannerKey}
                  active={!scannerPaused}
                  pausedMessage={
                    isValidating
                      ? 'Validação em andamento…'
                      : 'Câmera pausada até a confirmação do operador.'
                  }
                  onDetected={(credential) => void validateCredential(credential)}
                />

                <aside className="manual-validation" aria-labelledby="manual-heading">
                  <p className="section-kicker">Alternativa sempre disponível</p>
                  <h2 id="manual-heading">Digitar código manual</h2>
                  <p id="manual-code-help">
                    Use os 16 caracteres exibidos no ingresso. Espaços ou
                    hífens entre os grupos são aceitos.
                  </p>

                  <form onSubmit={submitManualCode} aria-busy={isValidating}>
                    <label htmlFor="manual-code">Código do ingresso</label>
                    <input
                      id="manual-code"
                      ref={manualInputRef}
                      value={manualCredential}
                      onChange={(event) =>
                        setManualCredential(event.target.value.toUpperCase())
                      }
                      placeholder="XXXX-XXXX-XXXX-XXXX"
                      autoComplete="off"
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      maxLength={32}
                      disabled={isValidating}
                      aria-invalid={Boolean(validationError)}
                      aria-describedby={
                        validationError
                          ? 'manual-code-help manual-code-error'
                          : 'manual-code-help'
                      }
                    />
                    <button
                      type="submit"
                      disabled={isValidating || !manualCredential.trim()}
                    >
                      {isValidating ? 'Validando…' : 'Validar ingresso'}
                    </button>
                  </form>

                  {validationError ? (
                    <div className="gate-validation-error" role="alert">
                      <p id="manual-code-error">{validationError}</p>
                      {scannerPaused ? (
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={resumeScanner}
                        >
                          Retomar câmera
                        </button>
                      ) : null}
                    </div>
                  ) : isValidating ? (
                    <p className="gate-validating" role="status">
                      Consultando o backend e consumindo atomicamente…
                    </p>
                  ) : null}
                </aside>
              </div>
            )}
          </section>
        )}
      </main>
      <div className="gate-attribution">
        <TmdbAttribution />
      </div>
    </div>
  )
}

interface GateResultProps {
  result: GateConsumeResult
  selectedSession: GateSession
  onNext: () => void
  onChangeSession: () => void
}

function GateResult({
  result,
  selectedSession,
  onNext,
  onChangeSession,
}: GateResultProps) {
  const content = resultContent[result.result]
  const resultRef = useRef<HTMLDivElement>(null)
  const didHandleResultRef = useRef(false)

  useEffect(() => {
    if (didHandleResultRef.current) {
      return
    }

    didHandleResultRef.current = true
    resultRef.current?.focus()

    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (!prefersReducedMotion && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(result.result === 'VALID' ? 80 : [60, 45, 60])
      } catch {
        // Haptics are optional and must never interrupt Gate operation.
      }
    }
  }, [result.result])

  return (
    <div
      ref={resultRef}
      className={`gate-result result-${result.result.toLowerCase()}`}
      aria-labelledby="gate-result-title"
      aria-describedby="gate-result-description"
      tabIndex={-1}
    >
      <span className="gate-result-icon" aria-hidden="true">{content.icon}</span>
      <p className="section-kicker">Resultado da validação</p>
      <span className="gate-result-code">{result.result}</span>
      <h2 id="gate-result-title">{content.title}</h2>
      <p id="gate-result-description" className="gate-result-description">
        {content.description}
      </p>

      {result.result === 'VALID' ? (
        <dl className="gate-result-facts">
          <div className="gate-seat-result">
            <dt>Assento</dt>
            <dd>{result.ticket.seat.label}</dd>
          </div>
          <div>
            <dt>Filme</dt>
            <dd>{result.ticket.session.movie.title}</dd>
          </div>
          <div>
            <dt>Sessão</dt>
            <dd>{formatSessionDate(result.ticket.session.startsAt)}</dd>
          </div>
        </dl>
      ) : result.result === 'ALREADY_USED' && result.usedAt ? (
        <p className="gate-used-at">
          Utilizado anteriormente em <strong>{formatUsedAt(result.usedAt)}</strong>.
        </p>
      ) : result.result === 'WRONG_EVENT' ? (
        <p className="gate-selected-context">
          Sessão atual: <strong>{selectedSession.movie.title}</strong>, {' '}
          {selectedSession.roomName}.
        </p>
      ) : null}

      <div className="gate-result-actions">
        <button type="button" onClick={onNext}>Validar próximo ingresso</button>
        <button type="button" className="secondary-button" onClick={onChangeSession}>
          Trocar sessão
        </button>
      </div>
    </div>
  )
}
