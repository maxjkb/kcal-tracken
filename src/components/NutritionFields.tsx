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
          <span className="text-xs text-slate-400">
            {label} <span className="text-slate-600">({unit})</span>
          </span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={Number.isFinite(value[key]) ? value[key] : 0}
            onChange={(e) => onChange({ ...value, [key]: Number(e.target.value) || 0 })}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
          />
        </label>
      ))}
    </div>
  )
}
