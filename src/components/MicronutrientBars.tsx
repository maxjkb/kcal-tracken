import { MICRONUTRIENT_LABELS, type MicronutrientKey } from '../lib/db'
import type { MicronutrientOverview, MicronutrientStatus } from '../lib/micronutrients'

/**
 * One CSS custom property per nutrient (defined in index.css, light + dark
 * variants) rather than the shared band colors this used to have. The bar no
 * longer changes color by status — see the gradient below — so each
 * nutrient needs its own fixed identity color instead, the same way the four
 * macros already each own one (--color-protein etc.). None of these ten
 * reuse a macro's hue: the macro rings sit on this exact page, directly
 * above this section.
 */
const MICRO_COLOR_VAR: Record<MicronutrientKey, string> = {
  vitaminD: '--color-micro-vitamind',
  vitaminB12: '--color-micro-vitaminb12',
  folate: '--color-micro-folate',
  vitaminC: '--color-micro-vitaminc',
  calcium: '--color-micro-calcium',
  iron: '--color-micro-iron',
  magnesium: '--color-micro-magnesium',
  zinc: '--color-micro-zinc',
  potassium: '--color-micro-potassium',
  iodine: '--color-micro-iodine',
}

/** Short label above each bar — the element symbol where the nutrient has one (Fe, Mg, Ca, Zn, K, I), the standard short vitamin name otherwise (D, B12, B9, C). */
const MICRO_ABBREVIATION: Record<MicronutrientKey, string> = {
  vitaminD: 'D',
  vitaminB12: 'B12',
  folate: 'B9',
  vitaminC: 'C',
  calcium: 'Ca',
  iron: 'Fe',
  magnesium: 'Mg',
  zinc: 'Zn',
  potassium: 'K',
  iodine: 'I',
}

const BAND_SR_LABEL: Record<'low' | 'average' | 'good', string> = {
  low: 'gering',
  average: 'durchschnittlich',
  good: 'gut',
}

/** Ratio at which the marker sits at the track's right edge — beyond this it stays pinned there, since the point is roughly where you land, not the exact multiple of the target. */
const MAX_RATIO_FOR_POSITION = 1.5

/**
 * The Statistik page's micronutrient section: one identity-colored gradient
 * track per curated nutrient, light-to-dark left-to-right, with a marker
 * pinned at the rolling week's average intake — no number, no percentage,
 * on purpose (see the brainstorm this shipped from: a text/photo estimate is
 * too loose to present as a precise mg/µg figure). Position along a
 * continuous track carries more than a three-word verdict did, and — unlike
 * the previous red/gray/green bars — a position is legible without color
 * vision at all; the qualitative word survives too, just moved to an
 * sr-only label per row rather than printed for sighted readers.
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
      <div className="grid grid-cols-2 gap-x-5 gap-y-4">
        {overview.statuses.map((status) => (
          <MicronutrientTile key={status.key} status={status} />
        ))}
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-ink-faint">
        Grobe KI-Schätzung, gemittelt über {overview.daysWithEstimate} von {overview.windowDays} Tagen mit geschätzten
        Mahlzeiten — kein Ersatz für eine Blutuntersuchung.
      </p>
    </div>
  )
}

function MicronutrientTile({ status }: { status: MicronutrientStatus }) {
  const colorVar = `var(${MICRO_COLOR_VAR[status.key]})`
  const srLabel = status.band !== null ? BAND_SR_LABEL[status.band] : 'keine Daten'
  const pct =
    status.average !== null ? Math.max(0, Math.min(100, (status.average / status.target / MAX_RATIO_FOR_POSITION) * 100)) : null

  return (
    <div className="flex flex-col items-start gap-1.5">
      <span className="text-xs font-bold" style={{ color: colorVar }} aria-hidden="true">
        {MICRO_ABBREVIATION[status.key]}
      </span>
      {/* The gradient itself is static — always the full light-to-dark span —
          only the marker moves. That's deliberate: it reads as a slider/gauge
          the value is pinned to, not as a fill draining in or out. */}
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-line/60">
        <div
          className="absolute inset-0 rounded-full"
          style={{ background: `linear-gradient(to right, color-mix(in srgb, ${colorVar} 15%, transparent), ${colorVar})` }}
          aria-hidden="true"
        />
        {pct !== null && (
          <span
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface shadow-sm shadow-black/20"
            style={{ left: `${pct}%`, backgroundColor: colorVar }}
            aria-hidden="true"
          />
        )}
      </div>
      <span className="text-[11px] text-ink-faint">{MICRONUTRIENT_LABELS[status.key]}</span>
      <span className="sr-only">{MICRONUTRIENT_LABELS[status.key]}: {srLabel}</span>
    </div>
  )
}
