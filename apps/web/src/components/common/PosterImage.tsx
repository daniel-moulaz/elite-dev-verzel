import { useState } from 'react'

export type PosterImageVariant =
  | 'hero'
  | 'card'
  | 'thumbnail'
  | 'ticket'
  | 'organizer'

interface PosterImageProps {
  src: string | null
  title: string
  className?: string
  loading?: 'eager' | 'lazy'
  decorative?: boolean
  variant?: PosterImageVariant
  sizes?: string
  srcSet?: string
}

const posterSizes: Record<PosterImageVariant, string> = {
  hero: '(max-width: 38rem) 6.5rem, (max-width: 48rem) 9.5rem, 15.25rem',
  card: '(max-width: 48rem) 8rem, 10rem',
  thumbnail: '(max-width: 48rem) 5rem, 6rem',
  ticket: '(max-width: 48rem) 5rem, 6.5rem',
  organizer: '(max-width: 48rem) 5rem, 8rem',
}

function tmdbPosterSrcSet(src: string): string | undefined {
  if (!src.includes('/t/p/w500/')) {
    return undefined
  }

  return [185, 342, 500]
    .map((width) => `${src.replace('/t/p/w500/', `/t/p/w${width}/`)} ${width}w`)
    .join(', ')
}

export function PosterImage({
  src,
  title,
  className = '',
  loading = 'lazy',
  decorative = false,
  variant = 'card',
  sizes,
  srcSet,
}: PosterImageProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const hasImage = Boolean(src) && failedSource !== src
  const imageClassName = [
    'poster-image',
    `poster-image-${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  if (hasImage && src) {
    const responsiveSourceSet = srcSet ?? tmdbPosterSrcSet(src)

    return (
      <img
        className={imageClassName}
        src={src}
        srcSet={responsiveSourceSet}
        sizes={responsiveSourceSet ? (sizes ?? posterSizes[variant]) : undefined}
        alt={decorative ? '' : `Pôster de ${title}`}
        width={500}
        height={750}
        loading={loading}
        decoding="async"
        fetchPriority={loading === 'eager' ? 'high' : 'auto'}
        onError={() => setFailedSource(src)}
      />
    )
  }

  return (
    <span
      className={`poster-fallback ${imageClassName}`}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : `Pôster indisponível para ${title}`}
    >
      <span aria-hidden="true">S</span>
      <small aria-hidden="true">{title}</small>
    </span>
  )
}
