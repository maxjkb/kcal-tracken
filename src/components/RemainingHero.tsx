import { MacroIcon, type MacroType } from './MacroIcon'

type Totals = { kcal: number; protein: number; carbs: number; fat: number }

const MACRO_COLOR: Record<Exclude<MacroType, 'kcal'>, string> = {
  protein: 'var(--color-protein)',
  carbs: 'var(--color-carbs)',
  fat: 'var(--color-fat)',
}

const MACRO_LABEL: Record<Exclude<MacroType, 'kcal'>, string> = {
  protein: 'Protein',
  carbs: 'Carbs',
  fat: 'Fett',
}

function clampPct(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0
  return Math.max(0, Math.min(100, ratio * 100))
}

/**
 * Big-Number-Redesign's central device, replacing NutrientRings on Feed
 * (point 1: "immer die Kalorien als präsente Zahl" — Kalorien is always the
 * hero figure here, on every screen this appears on). Shows the REMAINING
 * amount rather than a percentage or the raw total: a ring's "fuller =
 * better" reading is exactly what this replaces, and a percentage carries
 * the same problem one step removed — the explicit ask was for absolute
 * numbers. Protein/Carbs/Fett follow as a compact three-up strip below,
 * same remaining-not-consumed logic, each with its own thin scale line
 * (`.hero-rule`) instead of a ring.
 *
 * Falls back to the plain totals (nothing to subtract from) when there's no
 * body profile yet — the same condition NutrientRings used to gate its own
 * percent display and footer note on, kept identical here so nothing about
 * the "set up your body profile first" flow changed, only its presentation.
 */
export function RemainingHero({
  kcal,
  protein,
  carbs,
  fat,
  targets,
}: {
  kcal: number
  protein: number
  carbs: number
  fat: number
  targets: Totals | null
}) {
  const kcalRemaining = targets ? targets.kcal - kcal : null
  // Same "überschritten = rot" convention as everywhere else kcal balance is
  // shown (task #49) — exceeding the target flips the hero red instead of
  // reading as more progress toward a goal.
  const over = kcalRemaining !== null && kcalRemaining < 0
  const kcalColor = over ? 'var(--color-danger)' : 'var(--color-kcal)'
  const kcalRatio = targets ? kcal / targets.kcal : 0

  const strip = (['protein', 'carbs', 'fat'] as const).map((type) => {
    const value = { protein, carbs, fat }[type]
    const target = targets?.[type]
    const remaining = target !== undefined ? target - value : null
    return { type, value, target, remaining }
  })

  return (
    <div>
      <div className="flex items-baseline gap-1.5">
        <span className="hero-num text-5xl" style={{ color: kcalColor }}>
          {Math.round(Math.abs(kcalRemaining ?? kcal)).toLocaleString('de-DE')}
        </span>
        <span className="text-lg font-semibold text-ink-soft">kcal</span>
      </div>
      <p className="mt-0.5 text-xs font-medium text-ink-soft">
        {targets ? (over ? 'kcal über dem Ziel' : 'kcal übrig heute') : 'kcal heute'}
      </p>
      {targets && (
        <div className="hero-rule mt-3">
          <i style={{ width: `${clampPct(kcalRatio)}%`, background: kcalColor }} />
        </div>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2">
        {strip.map(({ type, value, target, remaining }) => {
          const color = MACRO_COLOR[type]
          const macroOver = remaining !== null && remaining < 0
          return (
            <div key={type} className="rounded-2xl bg-bg/70 p-3">
              <div className="flex items-center gap-1.5" style={{ color }}>
                <MacroIcon type={type} className="h-3.5 w-3.5" />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                  {MACRO_LABEL[type]}
                </span>
              </div>
              <div className="mt-1 text-lg font-bold text-ink">{Math.round(Math.abs(remaining ?? value))}g</div>
              <div className="text-[10px] text-ink-soft">{target !== undefined ? (macroOver ? 'über Ziel' : 'übrig') : ''}</div>
              {target !== undefined && (
                <div className="hero-rule mt-1.5" style={{ height: 2 }}>
                  <i style={{ width: `${clampPct(value / target)}%`, background: color }} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!targets && (
        <p className="mt-3 text-center text-[11px] text-ink-faint">
          Lege Körperwerte in den Einstellungen fest, um hier deinen Tagesfortschritt zu sehen.
        </p>
      )}
    </div>
  )
}
