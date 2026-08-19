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
    title: 'Entrada liberada',
    description: 'Ingresso válido e consumido agora.',
  },
  INVALID: {
    icon: '×',
    title: 'Entrada negada',
    description: 'Ingresso inválido. A credencial não foi reconhecida.',
  },
  ALREADY_USED: {
    icon: '!',
    title: 'Entrada já registrada',
    description: 'Este ingresso já havia sido consumido nesta sessão.',
  },
  WRONG_EVENT: {
    icon: '↔',
    title: 'Sessão incorreta',
    description: 'O ingresso não pertence à sessão selecionada. Não foi consumido.',
  },
} as const

function formatUsedAt(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value))
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
  const validationInFlightRef = useRef(false)
  const scannerTitleRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (selectedSession && !consumeResult) {
      scannerTitleRef.current?.focus()
    }
  }, [consumeResult, scannerKey, selectedSession])

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
    setSelectedSession(null)
    setConsumeResult(null)
    setManualCredential('')
    setValidationError('')
    setScannerPaused(true)
  }

  function validateNext() {
    setConsumeResult(null)
    setManualCredential('')
    setValidationError('')
    setScannerPaused(false)
    setScannerKey((value) => value + 1)
  }

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

  return (
    <div className="gate-shell">
      <header className="gate-topbar">
        <div className="gate-brand">
          <BrandLockup context="Portaria" />
          <span className="gate-mode">Operação de acesso</span>
        </div>
        <div className="gate-account">
          <span>{user.name}</span>
          <button type="button" className="text-button" onClick={onLogout}>
            Sair
          </button>
        </div>
      </header>

      <main className="gate-content">
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
              <button
                type="button"
                className="secondary-button"
                onClick={changeSession}
                disabled={isValidating}
              >
                Trocar sessão
              </button>
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
                  <p>
                    Use os 16 caracteres exibidos no ingresso. Espaços ou
                    hífens entre os grupos são aceitos.
                  </p>

                  <form onSubmit={submitManualCode} aria-busy={isValidating}>
                    <label htmlFor="manual-code">Código do ingresso</label>
                    <input
                      id="manual-code"
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
                      <p>{validationError}</p>
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

  useEffect(() => {
    resultRef.current?.focus()
  }, [])

  return (
    <div
      ref={resultRef}
      className={`gate-result result-${result.result.toLowerCase()}`}
      role="status"
      aria-live="assertive"
      tabIndex={-1}
    >
      <span className="gate-result-icon" aria-hidden="true">{content.icon}</span>
      <p className="section-kicker">Resultado da validação</p>
      <span className="gate-result-code">{result.result}</span>
      <h2>{content.title}</h2>
      <p className="gate-result-description">{content.description}</p>

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
