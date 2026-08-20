import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AppErrorBoundary } from './components/common/AppErrorBoundary'
import { OfflineNotice } from './components/common/OfflineNotice'
import { ToastProvider } from './components/common/ToastProvider'
import './styles.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Elemento raiz da aplicação não encontrado.')
}

createRoot(rootElement).render(
  <StrictMode>
    <ToastProvider>
      <a className="skip-link" href="#main-content">
        Pular para o conteúdo
      </a>
      <OfflineNotice hideDuringFullscreen />
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </ToastProvider>
  </StrictMode>,
)
