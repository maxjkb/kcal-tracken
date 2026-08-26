import { DayShape, type DayShapeValues } from './DayShape'
import { MacroIcon } from './MacroIcon'
import { formatMacro, MACRO_COLOR_VAR, MACRO_LABELS, MACRO_ORDER } from '../lib/macros'

/**
 * The day's headline: the bloom, its kcal figure, and the four numbers
 * underneath it.
 *
 * The split of labor is the point. The shape answers "how did today go" in
 * one glance and no reading; the legend answers "by how much" for anyone who
 * wants the actual figures. HIG (Charting Data) calls for exactly this
 * pairing — "examine the data from multiple levels… viewing from a macro
 * level can help you determine high-level summaries, whereas examining
 * individual data points might help you draw people's attention to specific
 * values" — rather than making one element try to do both jobs, which is
 * what four labelled rings were doing.
 *
 * The kcal figure sits inside the bloom's core because it is the number
 * people actually come here for; the fact that kcal also has its own petal
 * is deliberate redundancy, not an oversight — the petal gives it a position
 * in the shape, the figure gives it a value, and Apple's own Activity rings
 * pair a ring with its number the same way.
 */
export function DaySummary({
  values,
  targets,
  caption,
}: {
  values: DayShapeValues
  targets: DayShapeValues | null
  /** Small line above the figure, e.g. "Heute" or "Ø pro Tag" — the shape is identical, only its scope changes. */
  caption?: string
}) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <DayShape values={values} targets={targets} size={196} />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {caption && (
            <span className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-faint">{caption}</span>
          )}
          <span className="type-figure text-[2.1rem] text-ink">{Math.round(values.kcal)}</span>
          <span className="text-[10px] font-medium text-ink-soft">kcal</span>
        </div>
      </div>

      <div className="mt-4 grid w-full grid-cols-4 gap-1">
        {MACRO_ORDER.map((metric) => {
          const target = targets?.[metric]
          const percent = target ? Math.round((values[metric] / target) * 100) : null
          return (
            <div key={metric} className="flex flex-col items-center gap-1">
              <span style={{ color: MACRO_COLOR_VAR[metric] }} aria-hidden="true">
                <MacroIcon type={metric} className="h-3.5 w-3.5" />
              </span>
              <span className="text-xs font-semibold text-ink">{formatMacro(metric, values[metric])}</span>
              <span className="text-[10px] leading-tight text-ink-faint">
                {percent !== null ? `${percent} %` : MACRO_LABELS[metric]}
              </span>
            </div>
          )
        })}
      </div>

      {!targets && (
        <p className="mt-3 text-center text-[11px] leading-relaxed text-ink-faint">
          Lege Körperwerte in den Einstellungen fest, um deinen Tagesfortschritt als Form zu sehen.
        </p>
      )}
    </div>
  )
}
