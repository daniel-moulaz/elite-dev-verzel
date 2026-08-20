import { useEffect, useState } from 'react'

interface OfflineNoticeProps {
  fullscreenOnly?: boolean
  hideDuringFullscreen?: boolean
}

export function OfflineNotice({
  fullscreenOnly = false,
  hideDuringFullscreen = false,
}: OfflineNoticeProps) {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [isFullscreen, setIsFullscreen] = useState(
    () => document.fullscreenElement !== null,
  )

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine)

    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)

    return () => {
      window.removeEventListener('online', updateOnlineStatus)
      window.removeEventListener('offline', updateOnlineStatus)
    }
  }, [])

  useEffect(() => {
    if (!hideDuringFullscreen) {
      return
    }

    const updateFullscreenStatus = () => {
      setIsFullscreen(document.fullscreenElement !== null)
    }

    document.addEventListener('fullscreenchange', updateFullscreenStatus)
    return () => {
      document.removeEventListener('fullscreenchange', updateFullscreenStatus)
    }
  }, [hideDuringFullscreen])

  useEffect(() => {
    if (fullscreenOnly) {
      return
    }

    document.documentElement.classList.toggle('is-offline', !isOnline)

    return () => document.documentElement.classList.remove('is-offline')
  }, [fullscreenOnly, isOnline])

  if (isOnline || (hideDuringFullscreen && isFullscreen)) {
    return null
  }

  return (
    <div
      className={`offline-notice ${fullscreenOnly ? 'gate-fullscreen-offline' : ''}`.trim()}
      role="status"
      aria-live="polite"
    >
      <span aria-hidden="true">!</span>
      Você está offline. Algumas ações podem não funcionar.
    </div>
  )
}
