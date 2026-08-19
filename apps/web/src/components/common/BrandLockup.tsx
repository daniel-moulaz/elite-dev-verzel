interface BrandLockupProps {
  context?: string
}

export function BrandLockup({ context = 'Cinemas' }: BrandLockupProps) {
  return (
    <span className="brand-lockup">
      <strong className="brand-word">SEPTEM</strong>
      <small className="brand-context">{context}</small>
    </span>
  )
}
