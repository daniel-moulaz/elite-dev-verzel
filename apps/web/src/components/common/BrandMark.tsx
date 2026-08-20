interface BrandMarkProps {
  className?: string
}

export function BrandMark({ className = '' }: BrandMarkProps) {
  return (
    <svg
      className={`brand-mark ${className}`.trim()}
      viewBox="0 0 36 36"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="brand-mark-frame"
        d="M27.5 5.5H10.5a5 5 0 0 0-5 5v15a5 5 0 0 0 5 5h17"
      />
      <path
        className="brand-mark-s"
        d="M26.5 10.5H14a4 4 0 0 0 0 8h8a4 4 0 0 1 0 8H9.5"
      />
      <path className="brand-mark-accent" d="M30.5 9v18" />
    </svg>
  )
}
