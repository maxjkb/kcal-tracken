import type { Nutrition } from '../lib/db'

const FIELDS: { key: keyof Nutrition; label: string; unit: string }[] = [
  { key: 'kcal', label: 'Kalorien', unit: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Kohlenhydrate', unit: 'g' },
  { key: 'fat', label: 'Fett', unit: 'g' },
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
      {FIELDS.map(({ key, label, unit }) => (
        <label key={key} className="flex flex-col gap-1">
          <span className="text-xs text-ink-soft">
            {label} <span className="text-ink-faint">({unit})</span>
          </span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={Number.isFinite(value[key]) ? value[key] : 0}
            onChange={(e) => onChange({ ...value, [key]: Number(e.target.value) || 0 })}
            className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-kcal focus:outline-none"
          />
        </label>
      ))}
    </div>
  )
}
