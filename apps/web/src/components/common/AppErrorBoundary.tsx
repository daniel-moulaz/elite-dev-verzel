import { Component, type ReactNode } from 'react'
import { BrandLockup } from './BrandLockup'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  hasError: boolean
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <main id="main-content" className="app-shell" tabIndex={-1}>
          <section className="auth-panel status-panel" role="alert">
            <BrandLockup />
            <p className="section-kicker">Falha ao carregar</p>
            <h1>Não foi possível abrir esta tela.</h1>
            <p>
              Recarregue a aplicação para buscar novamente os arquivos mais
              recentes.
            </p>
            <button type="button" onClick={() => window.location.reload()}>
              Recarregar aplicação
            </button>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}
