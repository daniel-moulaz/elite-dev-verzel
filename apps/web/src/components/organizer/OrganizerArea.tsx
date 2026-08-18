import { useState } from 'react'
import type { AuthenticatedUser } from '../../api'
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
        <button
          type="button"
          className="brand-button"
          onClick={() => setScreen({ name: 'sessions' })}
          aria-label="Ir para Minhas sessões"
        >
          <span className="brand-mark" aria-hidden="true">
            E
          </span>
          <span>
            <strong>Elite Cinema</strong>
            <small>Programação</small>
          </span>
        </button>
        <div className="account-actions">
          <span className="account-name">{user.name}</span>
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
            accessToken={accessToken}
            sessionId={screen.sessionId}
            onBack={() => setScreen({ name: 'sessions' })}
          />
        ) : (
          <SessionEditor
            accessToken={accessToken}
            onBack={() => setScreen({ name: 'sessions' })}
          />
        )}
      </main>

      <TmdbAttribution />
    </div>
  )
}
