import type { Period } from '../lib/stats'
import { MonthIcon, WeekIcon, YearIcon } from './PickerIcons'

const OPTIONS: { key: Period; icon: typeof WeekIcon; label: string }[] = [
  { key: 'week', icon: WeekIcon, label: 'Woche' },
  { key: 'month', icon: MonthIcon, label: 'Monat' },
  { key: 'year', icon: YearIcon, label: 'Jahr' },
]

/**
 * Small Woche/Monat/Jahr icon toggle, shared by every chart card on the
 * Statistik feed (MacroTrendCard, IllnessChart) — each card owns its own
 * period independently now that the page itself no longer has a single
 * shared switcher (see MacroTrendCard's own doc comment for why). "Tag"
 * isn't an option here — none of these are single-day views.
 */
export function PeriodToggle({ value, onChange }: { value: Period; onChange: (period: Period) => void }) {
  return (
    <div className="flex gap-0.5 rounded-full bg-bg p-0.5">
      {OPTIONS.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-label={label}
          aria-pressed={value === key}
          className={`flex h-6 w-7 items-center justify-center rounded-full transition ${
            value === key ? 'bg-accent text-bg' : 'text-ink-faint'
          }`}
        >
          <Icon className="h-3 w-3" />
        </button>
      ))}
    </div>
  )
}
