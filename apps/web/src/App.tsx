import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  ApiError,
  getCurrentUser,
  login,
  setUnauthorizedHandler,
  type AuthenticatedUser,
  type Role,
} from './api'
import { OrganizerArea } from './components/organizer/OrganizerArea'

const accessTokenKey = 'elite-dev-access-token'

type AuthState =
  | { status: 'restoring' }
  | { status: 'anonymous'; notice?: string }
  | {
      status: 'authenticated'
      user: AuthenticatedUser
      accessToken: string
    }

const roleContent: Record<
  Role,
  { eyebrow: string; title: string; description: string }
> = {
  ORGANIZER: {
    eyebrow: 'Organizador',
    title: 'Área temporária do organizador',
    description: 'Seu acesso ORGANIZER foi confirmado pela API.',
  },
  CUSTOMER: {
    eyebrow: 'Cliente',
    title: 'Área temporária do cliente',
    description: 'Seu acesso CUSTOMER foi confirmado pela API.',
  },
  GATE: {
    eyebrow: 'Portaria',
    title: 'Área temporária da portaria',
    description: 'Seu acesso GATE foi confirmado pela API.',
  },
}

function initialAuthState(): AuthState {
  return sessionStorage.getItem(accessTokenKey)
    ? { status: 'restoring' }
    : { status: 'anonymous' }
}

export function App() {
  const [authState, setAuthState] = useState<AuthState>(initialAuthState)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  const clearAuthentication = useCallback(() => {
    sessionStorage.removeItem(accessTokenKey)
    setLoginError(null)
    setAuthState({ status: 'anonymous' })
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
          setAuthState({ status: 'anonymous' })
          return
        }

        setAuthState({
          status: 'anonymous',
          notice:
            'Não foi possível restaurar sua sessão. Verifique a API e entre novamente.',
        })
      })

    return () => controller.abort()
  }, [])

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
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : 'Não foi possível conectar à API. Tente novamente.'
      setLoginError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleLogout() {
    clearAuthentication()
  }

  if (authState.status === 'restoring') {
    return (
      <main className="app-shell" aria-busy="true">
        <section className="auth-panel status-panel" aria-live="polite">
          <p className="eyebrow">Elite Dev Verzel</p>
          <h1>Validando sua sessão</h1>
          <p>Aguarde enquanto confirmamos seu acesso.</p>
        </section>
      </main>
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

    const content = roleContent[authState.user.role]

    return (
      <main className="app-shell">
        <section className="auth-panel role-panel">
          <p className="eyebrow">{content.eyebrow}</p>
          <h1>{content.title}</h1>
          <p>{content.description}</p>

          <dl className="identity-list">
            <div>
              <dt>Nome</dt>
              <dd>{authState.user.name}</dd>
            </div>
            <div>
              <dt>E-mail</dt>
              <dd>{authState.user.email}</dd>
            </div>
            <div>
              <dt>Papel</dt>
              <dd>{authState.user.role}</dd>
            </div>
          </dl>

          <button type="button" className="secondary-button" onClick={handleLogout}>
            Sair
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="auth-panel">
        <p className="eyebrow">Elite Dev Verzel</p>
        <h1>Entrar</h1>
        <p className="intro">Use uma das contas de demonstração do projeto.</p>

        {authState.notice ? (
          <p className="message error-message" role="alert">
            {authState.notice}
          </p>
        ) : null}

        <form onSubmit={handleLogin} aria-busy={isSubmitting}>
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

          {loginError ? (
            <p className="message error-message" role="alert">
              {loginError}
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
