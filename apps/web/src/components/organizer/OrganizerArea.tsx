import { useState } from 'react'
import type { AuthenticatedUser } from '../../api'
import { BrandLockup } from '../common/BrandLockup'
import { TmdbAttribution } from '../public/TmdbAttribution'
import { SessionEditor } from './SessionEditor'
import { SessionList } from './SessionList'

interface OrganizerAreaProps {
  accessToken: string
  user: AuthenticatedUser
  onLogout: () => void
}

type OrganizerScreen =
  | { name: 'sessions' }
  | { name: 'create' }
  | { name: 'details'; sessionId: string }

export function OrganizerArea({
  accessToken,
  user,
  onLogout,
}: OrganizerAreaProps) {
  const [screen, setScreen] = useState<OrganizerScreen>({ name: 'sessions' })

  return (
    <div className="organizer-shell">
      <header className="topbar">
        <div className="header-primary">
          <button
            type="button"
            className="brand-button"
            onClick={() => setScreen({ name: 'sessions' })}
            aria-label="SEPTEM — ir para Minhas sessões"
          >
            <BrandLockup context="Programação" />
          </button>
          <nav className="header-nav" aria-label="Navegação do organizador">
            <button
              type="button"
              className={screen.name === 'sessions' ? 'is-active' : undefined}
              aria-current={screen.name === 'sessions' ? 'page' : undefined}
              onClick={() => setScreen({ name: 'sessions' })}
            >
              Minhas sessões
            </button>
            <button
              type="button"
              className={screen.name === 'create' ? 'is-active' : undefined}
              aria-current={screen.name === 'create' ? 'page' : undefined}
              onClick={() => setScreen({ name: 'create' })}
            >
              Criar sessão
            </button>
          </nav>
        </div>
        <div className="account-actions">
          <span className="account-name" title={user.email}>{user.name}</span>
          <button type="button" className="text-button" onClick={onLogout}>
            Sair
          </button>
        </div>
      </header>

      <main>
        {screen.name === 'sessions' ? (
          <SessionList
            accessToken={accessToken}
            onCreate={() => setScreen({ name: 'create' })}
            onOpen={(sessionId) => setScreen({ name: 'details', sessionId })}
          />
        ) : screen.name === 'details' ? (
          <SessionEditor
            key={`session-${screen.sessionId}`}
            accessToken={accessToken}
            sessionId={screen.sessionId}
            onBack={() => setScreen({ name: 'sessions' })}
          />
        ) : (
          <SessionEditor
            key="new-session"
            accessToken={accessToken}
            onBack={() => setScreen({ name: 'sessions' })}
          />
        )}
      </main>

      <TmdbAttribution />
    </div>
  )
}
