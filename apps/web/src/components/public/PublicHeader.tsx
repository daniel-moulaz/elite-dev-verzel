import type { AuthenticatedUser } from '../../api'
import { BrandLockup } from '../common/BrandLockup'

interface PublicHeaderProps {
  user: AuthenticatedUser | undefined
  onHome: () => void
  onLogin: () => void
  onLogout: () => void
  onTickets: () => void
  publicOnly?: boolean
  activeItem?: 'programming' | 'tickets'
}

export function PublicHeader({
  user,
  onHome,
  onLogin,
  onLogout,
  onTickets,
  publicOnly = false,
  activeItem,
}: PublicHeaderProps) {
  return (
    <header className="topbar public-topbar">
      <div className="header-primary">
        <button
          type="button"
          className="brand-button"
          onClick={onHome}
          aria-label="SEPTEM Cinemas — ir para a programação"
        >
          <BrandLockup />
        </button>

        <nav className="main-navigation" aria-label="Navegação principal">
          <button
            type="button"
            className={`nav-link ${activeItem === 'programming' ? 'is-active' : ''}`.trim()}
            aria-current={activeItem === 'programming' ? 'page' : undefined}
            onClick={onHome}
          >
            Programação
          </button>
          {!publicOnly && user?.role === 'CUSTOMER' ? (
            <button
              type="button"
              className={`nav-link ${activeItem === 'tickets' ? 'is-active' : ''}`.trim()}
              aria-current={activeItem === 'tickets' ? 'page' : undefined}
              onClick={onTickets}
            >
              Meus ingressos
            </button>
          ) : null}
        </nav>
      </div>

      {publicOnly ? null : (
        <div className="account-actions">
          {user ? (
            <>
              <span className="account-name" title={user.email}>{user.name}</span>
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
