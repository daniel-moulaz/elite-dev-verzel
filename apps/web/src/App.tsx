import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from 'react'
import {
  ApiError,
  getCurrentUser,
  login,
  setUnauthorizedHandler,
  type AuthenticatedUser,
  type Reservation,
} from './api'
import { OrganizerArea } from './components/organizer/OrganizerArea'
import { PublicCatalog } from './components/public/PublicCatalog'
import { PublicHeader } from './components/public/PublicHeader'
import { ReservationSummary } from './components/public/ReservationSummary'
import { SessionDetail } from './components/public/SessionDetail'
import { TmdbAttribution } from './components/public/TmdbAttribution'
import { SharedTicket } from './components/tickets/SharedTicket'
import { TicketDetail } from './components/tickets/TicketDetail'
import { TicketList } from './components/tickets/TicketList'

const accessTokenKey = 'elite-dev-access-token'

type AuthState =
  | { status: 'restoring' }
  | { status: 'anonymous'; notice?: string }
  | {
      status: 'authenticated'
      user: AuthenticatedUser
      accessToken: string
    }

type PublicRoute =
  | { name: 'catalog' }
  | { name: 'login' }
  | { name: 'session'; sessionId: string }
  | { name: 'reservation'; reservationId: string }
  | { name: 'tickets' }
  | { name: 'ticket'; ticketId: string }
  | { name: 'shared'; token: string }

function initialAuthState(): AuthState {
  return sessionStorage.getItem(accessTokenKey)
    ? { status: 'restoring' }
    : { status: 'anonymous' }
}

function parsePublicRoute(pathname = window.location.pathname): PublicRoute {
  const segments = pathname.split('/').filter(Boolean)

  if (segments.length === 1 && segments[0] === 'login') {
    return { name: 'login' }
  }

  if (segments.length === 2 && segments[0] === 'sessions') {
    return { name: 'session', sessionId: segments[1]! }
  }

  if (segments.length === 2 && segments[0] === 'reservations') {
    return {
      name: 'reservation',
      reservationId: segments[1]!,
    }
  }

  if (segments.length === 2 && segments[0] === 'shared') {
    return { name: 'shared', token: segments[1]! }
  }

  if (segments.length === 2 && segments[0] === 'me' && segments[1] === 'tickets') {
    return { name: 'tickets' }
  }

  if (
    segments.length === 3 &&
    segments[0] === 'me' &&
    segments[1] === 'tickets'
  ) {
    return { name: 'ticket', ticketId: segments[2]! }
  }

  return { name: 'catalog' }
}

function routePath(route: PublicRoute): string {
  if (route.name === 'session') {
    return `/sessions/${encodeURIComponent(route.sessionId)}`
  }

  if (route.name === 'reservation') {
    return `/reservations/${encodeURIComponent(route.reservationId)}`
  }

  if (route.name === 'shared') {
    return `/shared/${encodeURIComponent(route.token)}`
  }

  if (route.name === 'ticket') {
    return `/me/tickets/${encodeURIComponent(route.ticketId)}`
  }

  if (route.name === 'tickets') {
    return '/me/tickets'
  }

  return route.name === 'login' ? '/login' : '/'
}

interface LoginScreenProps {
  notice: string | undefined
  errorMessage: string | null
  isSubmitting: boolean
  onBack: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

function LoginScreen({
  notice,
  errorMessage,
  isSubmitting,
  onBack,
  onSubmit,
}: LoginScreenProps) {
  return (
    <main className="app-shell login-shell">
      <section className="auth-panel">
        <button type="button" className="back-button" onClick={onBack}>
          <span aria-hidden="true">←</span> Voltar à programação
        </button>
        <p className="eyebrow">Elite Cinema</p>
        <h1>Entrar</h1>
        <p className="intro">
          Entre como cliente para reservar lugares ou use outra conta de
          demonstração para acessar sua respectiva área.
        </p>

        {notice ? (
          <p className="message error-message" role="alert">
            {notice}
          </p>
        ) : null}

        <form onSubmit={onSubmit} aria-busy={isSubmitting}>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={isSubmitting}
            />
          </div>

          <div className="field">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={isSubmitting}
            />
          </div>

          {errorMessage ? (
            <p className="message error-message" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  )
}

interface GateAreaProps {
  user: AuthenticatedUser
  onLogout: () => void
}

function GateArea({ user, onLogout }: GateAreaProps) {
  return (
    <main className="app-shell">
      <section className="auth-panel role-panel">
        <p className="eyebrow">Portaria</p>
        <h1>Área temporária da portaria</h1>
        <p>Seu acesso GATE foi confirmado pela API.</p>
        <dl className="identity-list">
          <div>
            <dt>Nome</dt>
            <dd>{user.name}</dd>
          </div>
          <div>
            <dt>E-mail</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>Papel</dt>
            <dd>{user.role}</dd>
          </div>
        </dl>
        <button type="button" className="secondary-button" onClick={onLogout}>
          Sair
        </button>
      </section>
    </main>
  )
}

export function App() {
  const [authState, setAuthState] = useState<AuthState>(initialAuthState)
  const [route, setRoute] = useState<PublicRoute>(parsePublicRoute)
  const [loginReturnPath, setLoginReturnPath] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [createdReservation, setCreatedReservation] =
    useState<Reservation | null>(null)

  const navigate = useCallback((path: string, replace = false) => {
    if (replace) {
      window.history.replaceState(null, '', path)
    } else {
      window.history.pushState(null, '', path)
    }
    setRoute(parsePublicRoute(path))
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [])

  const clearAuthentication = useCallback(() => {
    sessionStorage.removeItem(accessTokenKey)
    setLoginError(null)
    setAuthState({ status: 'anonymous' })
  }, [])

  useEffect(() => {
    function handlePopState() {
      setRoute(parsePublicRoute())
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(clearAuthentication)
    return () => setUnauthorizedHandler(null)
  }, [clearAuthentication])

  useEffect(() => {
    const accessToken = sessionStorage.getItem(accessTokenKey)

    if (!accessToken) {
      return
    }

    const controller = new AbortController()

    getCurrentUser(accessToken, controller.signal)
      .then((user) => {
        setAuthState({ status: 'authenticated', user, accessToken })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        if (error instanceof ApiError && error.status === 401) {
          sessionStorage.removeItem(accessTokenKey)
        }

        setAuthState({
          status: 'anonymous',
          notice:
            error instanceof ApiError && error.status === 401
              ? 'Sua sessão expirou. Entre novamente para continuar.'
              : 'Não foi possível restaurar sua sessão. Você ainda pode consultar a programação.',
        })
      })

    return () => controller.abort()
  }, [])

  function requestLogin(returnPath: string) {
    setLoginReturnPath(returnPath)
    setLoginError(null)
    navigate('/login')
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setLoginError(null)

    const form = event.currentTarget
    const formData = new FormData(form)
    const email = String(formData.get('email') ?? '')
    const password = String(formData.get('password') ?? '')

    try {
      const result = await login(email, password)
      sessionStorage.setItem(accessTokenKey, result.accessToken)
      form.reset()
      setAuthState({
        status: 'authenticated',
        user: result.user,
        accessToken: result.accessToken,
      })

      navigate(
        result.user.role === 'CUSTOMER' ? (loginReturnPath ?? '/') : '/',
        true,
      )
      setLoginReturnPath(null)
    } catch (error) {
      setLoginError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível conectar à API. Tente novamente.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleLogout() {
    clearAuthentication()
    setCreatedReservation(null)
    navigate('/')
  }

  function handleReservationCreated(reservation: Reservation) {
    setCreatedReservation(reservation)
    navigate(`/reservations/${reservation.id}`)
  }

  if (authState.status === 'restoring') {
    return (
      <main className="app-shell" aria-busy="true">
        <section className="auth-panel status-panel" aria-live="polite">
          <p className="eyebrow">Elite Cinema</p>
          <h1>Validando sua sessão</h1>
          <p>Aguarde enquanto confirmamos seu acesso.</p>
        </section>
      </main>
    )
  }

  if (route.name === 'shared') {
    return (
      <div className="public-shell">
        <PublicHeader
          user={undefined}
          onHome={() => navigate('/')}
          onLogin={() => requestLogin(routePath(route))}
          onLogout={handleLogout}
          onTickets={() => navigate('/me/tickets')}
          publicOnly
        />
        <main>
          <SharedTicket
            key={route.token}
            token={route.token}
            onBack={() => navigate('/')}
          />
        </main>
        <TmdbAttribution />
      </div>
    )
  }

  if (authState.status === 'authenticated') {
    if (authState.user.role === 'ORGANIZER') {
      return (
        <OrganizerArea
          accessToken={authState.accessToken}
          user={authState.user}
          onLogout={handleLogout}
        />
      )
    }

    if (authState.user.role === 'GATE') {
      return <GateArea user={authState.user} onLogout={handleLogout} />
    }
  }

  if (route.name === 'login') {
    return (
      <LoginScreen
        notice={authState.status === 'anonymous' ? authState.notice : undefined}
        errorMessage={loginError}
        isSubmitting={isSubmitting}
        onBack={() => navigate(loginReturnPath ?? '/')}
        onSubmit={(event) => void handleLogin(event)}
      />
    )
  }

  const customer =
    authState.status === 'authenticated' ? authState.user : undefined
  const accessToken =
    authState.status === 'authenticated' ? authState.accessToken : undefined

  return (
    <div className="public-shell">
      <PublicHeader
        user={customer}
        onHome={() => navigate('/')}
        onLogin={() => requestLogin(routePath(route))}
        onLogout={handleLogout}
        onTickets={() => navigate('/me/tickets')}
      />
      <main>
        {route.name === 'session' ? (
          <SessionDetail
            key={route.sessionId}
            sessionId={route.sessionId}
            user={customer}
            accessToken={accessToken}
            onBack={() => navigate('/')}
            onRequireLogin={() => requestLogin(routePath(route))}
            onReservationCreated={handleReservationCreated}
          />
        ) : route.name === 'reservation' && customer && accessToken ? (
          <ReservationSummary
            key={route.reservationId}
            reservationId={route.reservationId}
            accessToken={accessToken}
            initialReservation={
              createdReservation?.id === route.reservationId
                ? createdReservation
                : undefined
            }
            onBackToCatalog={() => navigate('/')}
            onBackToSession={(sessionId) => navigate(`/sessions/${sessionId}`)}
            onOpenTicket={(ticketId) => navigate(`/me/tickets/${ticketId}`)}
            onOpenTickets={() => navigate('/me/tickets')}
          />
        ) : route.name === 'tickets' && customer && accessToken ? (
          <TicketList
            accessToken={accessToken}
            onBack={() => navigate('/')}
            onOpenTicket={(ticketId) => navigate(`/me/tickets/${ticketId}`)}
          />
        ) : route.name === 'ticket' && customer && accessToken ? (
          <TicketDetail
            key={route.ticketId}
            accessToken={accessToken}
            ticketId={route.ticketId}
            onBack={() => navigate('/me/tickets')}
          />
        ) : route.name === 'reservation' ? (
          <div className="public-content">
            <div className="content-state public-state">
              <p className="section-kicker">Reserva protegida</p>
              <h1>Entre para consultar esta reserva.</h1>
              <p>Somente o cliente que criou o hold pode visualizar seus dados.</p>
              <button type="button" onClick={() => requestLogin(routePath(route))}>
                Entrar como cliente
              </button>
            </div>
          </div>
        ) : route.name === 'tickets' || route.name === 'ticket' ? (
          <div className="public-content">
            <div className="content-state public-state">
              <p className="section-kicker">Bilheteria pessoal</p>
              <h1>Entre para acessar seus ingressos.</h1>
              <p>Somente o titular pode consultar o QR e gerenciar compartilhamentos.</p>
              <button type="button" onClick={() => requestLogin(routePath(route))}>
                Entrar como cliente
              </button>
            </div>
          </div>
        ) : (
          <PublicCatalog
            onOpenSession={(sessionId) => navigate(`/sessions/${sessionId}`)}
          />
        )}
      </main>
      <TmdbAttribution />
    </div>
  )
}
