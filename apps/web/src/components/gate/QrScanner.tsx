import { useEffect, useRef, useState } from 'react'
import type { IScannerControls } from '@zxing/browser'

interface QrScannerProps {
  active: boolean
  pausedMessage: string
  onDetected: (credential: string) => void
}

type CameraState =
  | { status: 'starting' | 'scanning' }
  | { status: 'error'; message: string }

const expectedDecodeErrorKinds = new Set([
  'NotFoundException',
  'ChecksumException',
  'FormatException',
])

function isExpectedDecodeError(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const getKind = 'getKind' in error ? error.getKind : undefined

  if (typeof getKind === 'function') {
    try {
      return expectedDecodeErrorKinds.has(String(getKind.call(error)))
    } catch {
      return false
    }
  }

  const name = 'name' in error ? String(error.name) : ''
  return expectedDecodeErrorKinds.has(name)
}

function cameraErrorMessage(error: unknown) {
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String(error.name)
      : ''

  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Permissão da câmera negada. Autorize o acesso no navegador ou use o código manual.'
  }

  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'Nenhuma câmera compatível foi encontrada. Use o código manual.'
  }

  if (name === 'NotReadableError' || name === 'AbortError') {
    return 'A câmera está ocupada ou indisponível. Feche outros aplicativos e tente novamente.'
  }

  return 'Não foi possível iniciar a câmera. Em produção, use HTTPS ou informe o código manual.'
}

function stopVideo(video: HTMLVideoElement | null) {
  const stream = video?.srcObject

  if (typeof MediaStream !== 'undefined' && stream instanceof MediaStream) {
    for (const track of stream.getTracks()) {
      track.stop()
    }
  }

  if (video) {
    video.srcObject = null
  }
}

function stopScanner(controls: IScannerControls | null) {
  if (!controls) {
    return
  }

  try {
    const stopResult = (
      controls.stop as unknown as () => void | Promise<void>
    )()

    if (stopResult instanceof Promise) {
      void stopResult.catch(() => undefined)
    }
  } catch {
    // The video tracks are also stopped explicitly during cleanup.
  }
}

export function QrScanner({
  active,
  pausedMessage,
  onDetected,
}: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const detectedRef = useRef(false)
  const onDetectedRef = useRef(onDetected)
  const [cameraState, setCameraState] = useState<CameraState>({
    status: 'starting',
  })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    onDetectedRef.current = onDetected
  }, [onDetected])

  useEffect(() => {
    if (!active) {
      stopScanner(controlsRef.current)
      controlsRef.current = null
      stopVideo(videoRef.current)
      return
    }

    let cancelled = false
    const videoElement = videoRef.current
    detectedRef.current = false

    async function startScanner() {
      if (!navigator.mediaDevices?.getUserMedia || !videoElement) {
        setCameraState({
          status: 'error',
          message:
            'Este navegador não disponibiliza câmera neste contexto. Use HTTPS ou informe o código manual.',
        })
        return
      }

      try {
        const { BrowserQRCodeReader } = await import('@zxing/browser')

        if (cancelled) {
          return
        }

        const reader = new BrowserQRCodeReader(undefined, {
          delayBetweenScanAttempts: 180,
          delayBetweenScanSuccess: 800,
        })
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoElement,
          (result, error, callbackControls) => {
            if (cancelled || detectedRef.current) {
              return
            }

            if (result) {
              detectedRef.current = true
              stopScanner(callbackControls)
              controlsRef.current = null
              onDetectedRef.current(result.getText())
              return
            }

            if (error && !isExpectedDecodeError(error)) {
              detectedRef.current = true
              stopScanner(callbackControls)
              controlsRef.current = null
              stopVideo(videoElement)
              setCameraState({
                status: 'error',
                message:
                  'A leitura da câmera foi interrompida. Tente abri-la novamente ou use o código manual.',
              })
            }
          },
        )

        if (cancelled || detectedRef.current) {
          stopScanner(controls)
          return
        }

        controlsRef.current = controls
        setCameraState({ status: 'scanning' })
      } catch (error) {
        if (!cancelled) {
          stopVideo(videoElement)
          setCameraState({
            status: 'error',
            message: cameraErrorMessage(error),
          })
        }
      }
    }

    const startTimer = window.setTimeout(() => void startScanner(), 0)

    return () => {
      cancelled = true
      window.clearTimeout(startTimer)
      stopScanner(controlsRef.current)
      controlsRef.current = null
      stopVideo(videoElement)
    }
  }, [active, attempt])

  const visibleCameraStatus = active ? cameraState.status : 'paused'

  return (
    <section className="gate-camera" aria-labelledby="camera-heading">
      <div className="gate-section-heading">
        <div>
          <p className="section-kicker">Leitura por câmera</p>
          <h2 id="camera-heading">Aponte para o QR Code</h2>
        </div>
        <span className={`camera-indicator camera-${visibleCameraStatus}`}>
          <span aria-hidden="true">●</span>{' '}
          {visibleCameraStatus === 'scanning'
            ? 'Lendo'
            : visibleCameraStatus === 'starting'
              ? 'Abrindo câmera'
              : visibleCameraStatus === 'paused'
                ? 'Câmera pausada'
                : 'Câmera indisponível'}
        </span>
      </div>

      <div className="camera-frame">
        <video
          ref={videoRef}
          muted
          playsInline
          aria-label="Prévia da câmera para leitura do QR Code"
        />
        <div className="camera-target" aria-hidden="true" />
        {!active ? (
          <p className="camera-overlay" role="status">
            {pausedMessage}
          </p>
        ) : cameraState.status === 'starting' ? (
          <p className="camera-overlay" role="status">
            Aguardando permissão da câmera…
          </p>
        ) : null}
      </div>

      {cameraState.status === 'error' ? (
        <div className="camera-help" role="alert">
          <p>{cameraState.message}</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setCameraState({ status: 'starting' })
              setAttempt((value) => value + 1)
            }}
          >
            Tentar abrir a câmera novamente
          </button>
        </div>
      ) : (
        <p className="camera-instruction">
          Mantenha o código inteiro dentro da marcação. A leitura pausa antes
          da validação para evitar envios repetidos.
        </p>
      )}
    </section>
  )
}
