import type { AuthenticatedUser } from '../../api'

interface PublicHeaderProps {
  user: AuthenticatedUser | undefined
  onHome: () => void
  onLogin: () => void
  onLogout: () => void
  onTickets: () => void
  publicOnly?: boolean
}

export function PublicHeader({
  user,
  onHome,
  onLogin,
  onLogout,
  onTickets,
  publicOnly = false,
}: PublicHeaderProps) {
  return (
    <header className="topbar public-topbar">
      <button
        type="button"
        className="brand-button"
        onClick={onHome}
        aria-label="Ir para a programação"
      >
        <span className="brand-mark" aria-hidden="true">
          E
        </span>
        <span>
          <strong>Elite Cinema</strong>
          <small>Sessões em cartaz</small>
        </span>
      </button>

      {publicOnly ? null : (
        <div className="account-actions">
          {user ? (
            <>
              {user.role === 'CUSTOMER' ? (
                <button
                  type="button"
                  className="text-button"
                  onClick={onTickets}
                >
                  Meus ingressos
                </button>
              ) : null}
              <span className="account-name">Olá, {user.name}</span>
              <button type="button" className="text-button" onClick={onLogout}>
                Sair
              </button>
            </>
          ) : (
            <button type="button" className="secondary-button" onClick={onLogin}>
              Entrar
            </button>
          )}
        </div>
      )}
    </header>
  )
}
