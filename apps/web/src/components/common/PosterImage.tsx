import { useState } from 'react'

interface PosterImageProps {
  src: string | null
  title: string
  className?: string
  loading?: 'eager' | 'lazy'
  decorative?: boolean
}

export function PosterImage({
  src,
  title,
  className = '',
  loading = 'lazy',
  decorative = false,
}: PosterImageProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const hasImage = Boolean(src) && failedSource !== src

  if (hasImage && src) {
    return (
      <img
        className={className}
        src={src}
        alt={decorative ? '' : `Pôster de ${title}`}
        loading={loading}
        decoding="async"
        onError={() => setFailedSource(src)}
      />
    )
  }

  return (
    <span
      className={`poster-fallback ${className}`.trim()}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : `Pôster indisponível para ${title}`}
    >
      <span aria-hidden="true">S</span>
      <small aria-hidden="true">{title}</small>
    </span>
  )
}
