import type { ComponentType } from 'react'
import { MacroIcon } from './MacroIcon'
import { TrophyIcon } from './PickerIcons'
import { ThermometerIcon } from './SickDayButton'
import type { StatsTileKey } from '../lib/statsLayout'

function MicronutrientIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      {/* Three linked nodes — a small molecule, standing in for "micronutrients" the same way the macro icons stand in for their own nutrient. */}
      <circle cx="6" cy="17" r="2.3" />
      <circle cx="17" cy="17" r="2.3" />
      <circle cx="12" cy="7" r="2.3" />
      <path strokeLinecap="round" d="M8 15.7 10.4 9M16 15.7 13.6 9" />
    </svg>
  )
}

/** One tile's icon + short label — the reorder sheet and the jump-row both key off this, so a new tile only ever needs one entry here. */
export const STATS_TILE_META: Record<StatsTileKey, { label: string; icon: ComponentType<{ className?: string }> }> = {
  kcal: { label: 'Kalorien', icon: (p) => <MacroIcon type="kcal" {...p} /> },
  suppScore: { label: 'Supp-Score', icon: TrophyIcon },
  illness: { label: 'Krankheit', icon: ThermometerIcon },
  micronutrients: { label: 'Mikronährstoffe', icon: MicronutrientIcon },
  carbs: { label: 'Kohlenhydrate', icon: (p) => <MacroIcon type="carbs" {...p} /> },
  protein: { label: 'Protein', icon: (p) => <MacroIcon type="protein" {...p} /> },
  fat: { label: 'Fett', icon: (p) => <MacroIcon type="fat" {...p} /> },
}
