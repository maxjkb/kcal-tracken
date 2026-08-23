import type { Nutrition } from '../lib/db'
import { MacroIcon, type MacroType } from './MacroIcon'

const FIELDS: { key: keyof Nutrition; label: string; unit: string; icon?: MacroType }[] = [
  { key: 'kcal', label: 'Kalorien', unit: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g', icon: 'protein' },
  { key: 'carbs', label: 'Kohlenhydrate', unit: 'g', icon: 'carbs' },
  { key: 'fat', label: 'Fett', unit: 'g', icon: 'fat' },
]

/** Guards against floating-point display artifacts like 38.300000000000004. */
function round1(value: number): number {
  return Math.round(value * 10) / 10
}

export function NutritionFields({
  value,
  onChange,
}: {
  value: Nutrition
  onChange: (next: Nutrition) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {FIELDS.map(({ key, label, unit, icon }) => (
        <label key={key} className="flex flex-col gap-1">
          <span className="flex items-center gap-1 text-xs text-ink-soft">
            {icon && <MacroIcon type={icon} className="h-3 w-3" />}
            {label} <span className="text-ink-faint">({unit})</span>
          </span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={Number.isFinite(value[key]) ? round1(value[key]) : 0}
            onChange={(e) => onChange({ ...value, [key]: Number(e.target.value) || 0 })}
            className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
          />
        </label>
      ))}
    </div>
  )
}
