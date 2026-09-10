import type { CSSProperties } from 'react'
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
 *
 * `perMeal`, when given, preserves the one bit of information the old
 * Stats-Tag "closed ring" style carried that a plain remaining-value doesn't:
 * the day's per-meal average. Shown as a small extra line rather than a
 * second ring-in-ring, since a closed/non-progress ring was itself part of
 * what this component replaces.
 */
/**
 * Round 4 (v2.4): the "kcal übrig heute" / "kcal über dem Ziel" caption (and
 * the macro strip's own "übrig" / "über Ziel") is gone — explicit feedback
 * that spelling out the state in words was redundant with the number itself
 * and just added clutter. In its place: the number stays the app's plain
 * ink color regardless of state (no more flipping the kcal figure red on
 * overage, the one thing here that *did* carry color before — task #49's
 * "überschritten = rot" is retired in favor of this, not layered under it),
 * and exceeding the target instead draws a colored ring around the number —
 * kcal in `--color-danger` (matches the red this app already uses for "over"
 * everywhere else, e.g. the Statistik balance tile), each macro in its own
 * identity color, "so eine Art visuelles Kennzeichen" rather than a caption
 * to read.
 */
function overRing(color: string): CSSProperties {
  return { boxShadow: `0 0 0 2px ${color}` }
}

export function RemainingHero({
  kcal,
  protein,
  carbs,
  fat,
  targets,
  perMeal,
}: {
  kcal: number
  protein: number
  carbs: number
  fat: number
  targets: Totals | null
  perMeal?: Totals
}) {
  const kcalRemaining = targets ? targets.kcal - kcal : null
  const over = kcalRemaining !== null && kcalRemaining < 0
  const kcalRatio = targets ? kcal / targets.kcal : 0

  const strip = (['protein', 'carbs', 'fat'] as const).map((type) => {
    const value = { protein, carbs, fat }[type]
    const target = targets?.[type]
    const remaining = target !== undefined ? target - value : null
    return { type, value, target, remaining }
  })

  return (
    <div>
      <div
        className={`flex items-baseline gap-1.5 ${over ? 'w-fit rounded-full pl-3 pr-3.5' : ''}`}
        style={over ? overRing('var(--color-danger)') : undefined}
      >
        <span className="hero-num text-5xl text-ink">
          {Math.round(Math.abs(kcalRemaining ?? kcal)).toLocaleString('de-DE')}
        </span>
        <span className="text-lg font-semibold text-ink-soft">kcal</span>
      </div>
      {!targets && <p className="mt-0.5 text-xs font-medium text-ink-soft">kcal heute</p>}
      {perMeal && (
        <p className="mt-0.5 text-xs font-medium text-ink-soft">Ø {Math.round(perMeal.kcal)} kcal pro Mahlzeit</p>
      )}
      {targets && (
        <div className="hero-rule mt-3">
          <i style={{ width: `${clampPct(kcalRatio)}%`, background: over ? 'var(--color-danger)' : 'var(--color-kcal)' }} />
        </div>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2">
        {strip.map(({ type, value, target, remaining }) => {
          const color = MACRO_COLOR[type]
          const macroOver = remaining !== null && remaining < 0
          const perMealValue = perMeal?.[type]
          return (
            <div key={type} className="rounded-2xl bg-bg/70 p-3">
              <div className="flex items-center gap-1.5" style={{ color }}>
                <MacroIcon type={type} className="h-3.5 w-3.5" />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                  {MACRO_LABEL[type]}
                </span>
              </div>
              <div
                className={`hero-num mt-1 inline-block text-lg text-ink ${macroOver ? 'w-fit rounded-full px-2' : ''}`}
                style={macroOver ? overRing(color) : undefined}
              >
                {Math.round(Math.abs(remaining ?? value))}g
              </div>
              {perMealValue !== undefined && <div className="text-[10px] text-ink-soft">Ø {Math.round(perMealValue)}g</div>}
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
