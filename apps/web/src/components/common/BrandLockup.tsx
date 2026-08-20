import { BrandMark } from './BrandMark'

interface BrandLockupProps {
  context?: string
  compact?: boolean
}

export function BrandLockup({
  context = 'Cinemas',
  compact = false,
}: BrandLockupProps) {
  return (
    <span
      className={`brand-lockup ${compact ? 'brand-lockup-compact' : ''}`.trim()}
    >
      <BrandMark />
      <span className="brand-copy">
        <strong className="brand-word">SEPTEM</strong>
        <small className="brand-context">{context}</small>
      </span>
    </span>
  )
}
