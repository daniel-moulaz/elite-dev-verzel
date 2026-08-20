import type { MouseEvent } from 'react'
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

function followInternalLink(
  event: MouseEvent<HTMLAnchorElement>,
  navigate: () => void,
) {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return
  }

  event.preventDefault()
  navigate()
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
        <a
          href="/"
          className="brand-button"
          onClick={(event) => followInternalLink(event, onHome)}
          aria-label="SEPTEM Cinemas — ir para a programação"
        >
          <BrandLockup />
        </a>

        <nav className="main-navigation" aria-label="Navegação principal">
          <a
            href="/"
            className={`nav-link ${activeItem === 'programming' ? 'is-active' : ''}`.trim()}
            aria-current={activeItem === 'programming' ? 'page' : undefined}
            onClick={(event) => followInternalLink(event, onHome)}
          >
            Programação
          </a>
          {!publicOnly && user?.role === 'CUSTOMER' ? (
            <a
              href="/me/tickets"
              className={`nav-link ${activeItem === 'tickets' ? 'is-active' : ''}`.trim()}
              aria-current={activeItem === 'tickets' ? 'page' : undefined}
              onClick={(event) => followInternalLink(event, onTickets)}
            >
              Meus ingressos
            </a>
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
            <a
              href="/login"
              className="secondary-button link-button"
              onClick={(event) => followInternalLink(event, onLogin)}
            >
              Entrar
            </a>
          )}
        </div>
      )}
    </header>
  )
}
