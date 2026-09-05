import type { Nutrition } from '../lib/db'
import { MacroIcon, type MacroType } from './MacroIcon'
import { NumberField } from './NumberField'

const FIELDS: { key: keyof Nutrition; label: string; unit: string; icon: MacroType }[] = [
  { key: 'kcal', label: 'Kalorien', unit: 'kcal', icon: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g', icon: 'protein' },
  { key: 'carbs', label: 'Carbs', unit: 'g', icon: 'carbs' },
  { key: 'fat', label: 'Fett', unit: 'g', icon: 'fat' },
]

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
          <NumberField
            value={value[key]}
            onChange={(next: number) => onChange({ ...value, [key]: next })}
            className="field rounded-xl px-3 py-2 text-sm"
          />
        </label>
      ))}
    </div>
  )
}
