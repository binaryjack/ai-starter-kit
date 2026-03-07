interface Props {
  value:      string
  label:      string
  sublabel?:  string
  href?:      string
  className?: string
}

/** A single metric — large bold value + descriptive label. Wraps in an anchor when href is provided. */
export function StatCard({ value, label, sublabel, href, className = '' }: Props) {
  const inner = (
    <>
      <span className="text-3xl font-extrabold text-brand-400">{value}</span>
      <span className="text-sm font-semibold text-neutral-200">{label}</span>
      {sublabel && <span className="text-xs text-neutral-500">{sublabel}</span>}
    </>
  )

  if (href) {
    return (
      <a
        href={href}
        className={`flex flex-col items-center gap-1 text-center transition-opacity hover:opacity-80 ${className}`}
      >
        {inner}
      </a>
    )
  }

  return (
    <div className={`flex flex-col items-center gap-1 text-center ${className}`}>
      {inner}
    </div>
  )
}
