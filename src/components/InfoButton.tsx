import { useState, type ReactNode } from 'react'
import { Sheet } from './Sheet'

/**
 * A small "i" icon that opens a Sheet with an explanation/disclaimer,
 * instead of that text sitting permanently on the page as a gray paragraph.
 *
 * Scoped deliberately: only genuine explanatory/disclaimer copy (medical
 * disclaimers, "how is this estimated" caveats, the quota reset cadence)
 * moved behind this — status and empty-state messages ("Kein API-Key
 * hinterlegt", "Noch keine Rezepte…") stay directly visible, since that's
 * information a screen needs to convey regardless of whether anyone taps
 * anything. The same "i" treatment KcalTrendChart/StatsPage already uses
 * for the chart legend, generalized into one reusable trigger+sheet so
 * every other disclaimer in the app doesn't reimplement its own.
 */
export function InfoButton({
  label,
  title,
  children,
  className = '',
}: {
  /** aria-label — say what the info is ABOUT, not just "Info". */
  label: string
  /** Sheet heading. */
  title: string
  children: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bg text-[10px] font-bold text-ink-faint hover:text-ink-soft ${className}`}
      >
        i
      </button>
      {open && (
        <Sheet onClose={() => setOpen(false)} sheetClassName="glass flex w-full max-w-lg flex-col rounded-t-3xl p-5 pt-7 sm:rounded-3xl">
          <h2 className="mb-3 text-lg font-semibold text-ink">{title}</h2>
          <div className="text-sm leading-relaxed text-ink-soft">{children}</div>
        </Sheet>
      )}
    </>
  )
}
