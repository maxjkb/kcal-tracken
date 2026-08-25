/** Share of the allowance at which the bar turns red — the point where it's worth acting on. */
const WARN_AT = 0.85

/**
 * A used-share bar with its percentage at the right end.
 *
 * Blue until 85% of the allowance is gone, red past it: the colour is the
 * warning, so the number doesn't have to be read to notice. The percentage
 * sits outside the track rather than inside it, because a label inside a bar
 * loses contrast exactly when the bar is nearly full and the label matters
 * most.
 */
export function QuotaBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const share = limit > 0 ? Math.min(1, used / limit) : 0
  const percent = Math.round(share * 100)
  const warning = share >= WARN_AT

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-medium text-ink">{label}</span>
        <span className="shrink-0 text-xs text-ink-soft">
          {used.toLocaleString('de-DE')} / {limit.toLocaleString('de-DE')}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div
          className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${label}: ${percent}% genutzt`}
        >
          <div
            className={`h-full rounded-full transition-[width,background-color] duration-500 ${
              warning ? 'bg-danger' : 'bg-accent'
            }`}
            style={{ width: `${Math.max(share > 0 ? 2 : 0, percent)}%` }}
          />
        </div>
        <span className={`w-10 shrink-0 text-right text-xs font-semibold ${warning ? 'text-danger' : 'text-ink-soft'}`}>
          {percent}%
        </span>
      </div>
    </div>
  )
}
