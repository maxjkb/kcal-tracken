import { MICRONUTRIENT_LABELS } from '../lib/db'
import type { MicronutrientBand } from '../lib/bodyProfile'
import type { MicronutrientOverview, MicronutrientStatus } from '../lib/micronutrients'

const BAND_COLOR: Record<MicronutrientBand, string> = {
  low: 'bg-danger',
  average: 'bg-ink-faint',
  good: 'bg-good',
}

const BAND_LABEL: Record<MicronutrientBand, string> = {
  low: 'gering',
  average: 'durchschnittlich',
  good: 'gut',
}

/** Floor so a real but small ratio still reads as a visible sliver, not nothing. */
const MIN_WIDTH_PCT = 6
/** Ratio at which the bar is already fully "good"-zone — beyond this it stays capped rather than stretching further, since the point is the band, not the exact multiple of the target. */
const MAX_RATIO_FOR_WIDTH = 1.5

/**
 * The Statistik page's micronutrient section: one thin bar per curated
 * nutrient, colored by band rather than filled to an exact percentage — no
 * number is ever shown, on purpose (see the brainstorm this shipped from:
 * a text/photo estimate is too loose to present as a precise mg/µg figure,
 * but reliable enough for "roughly low/average/good" read off a weekly
 * average). The color carries the verdict at a glance; the text label next
 * to it repeats it in words so the row still reads for anyone who can't
 * distinguish the colors.
 */
export function MicronutrientBars({ overview }: { overview: MicronutrientOverview | null | undefined }) {
  if (overview === undefined) return <p className="py-6 text-center text-sm text-ink-soft">Lädt…</p>

  if (overview === null) {
    return (
      <p className="py-6 text-center text-xs text-ink-soft">
        Körperprofil in den Einstellungen einrichten, um Mikronährstoff-Referenzwerte zu berechnen.
      </p>
    )
  }

  return (
    <div>
      <div className="flex flex-col gap-2.5">
        {overview.statuses.map((status) => (
          <MicronutrientRow key={status.key} status={status} />
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
        Grobe KI-Schätzung, gemittelt über {overview.daysWithEstimate} von {overview.windowDays} Tagen mit geschätzten
        Mahlzeiten — kein Ersatz für eine Blutuntersuchung.
      </p>
    </div>
  )
}

function MicronutrientRow({ status }: { status: MicronutrientStatus }) {
  const label = MICRONUTRIENT_LABELS[status.key]

  if (status.band === null || status.average === null) {
    return (
      <div className="flex items-center gap-2.5">
        <span className="w-[92px] shrink-0 truncate text-xs text-ink-soft">{label}</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line/60" />
        <span className="w-24 shrink-0 text-right text-[11px] text-ink-faint">keine Daten</span>
      </div>
    )
  }

  const ratio = status.average / status.target
  const widthPct = Math.max(MIN_WIDTH_PCT, Math.min(100, (ratio / MAX_RATIO_FOR_WIDTH) * 100))

  return (
    <div className="flex items-center gap-2.5">
      <span className="w-[92px] shrink-0 truncate text-xs text-ink-soft">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line/60">
        <div className={`h-full rounded-full ${BAND_COLOR[status.band]}`} style={{ width: `${widthPct}%` }} />
      </div>
      <span className="w-24 shrink-0 text-right text-[11px] font-medium text-ink-soft">{BAND_LABEL[status.band]}</span>
    </div>
  )
}
