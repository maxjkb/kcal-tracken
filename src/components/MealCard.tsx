import { useState } from 'react'
import type { Meal } from '../lib/db'
import { deleteMeal } from '../hooks/useMeals'

const MACRO_BADGE_BG: Record<'protein' | 'carbs' | 'fat', string> = {
  protein: 'bg-protein/15',
  carbs: 'bg-carbs/15',
  fat: 'bg-fat/15',
}

export function MealCard({ meal, onView }: { meal: Meal; onView: () => void }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  return (
    <div className="flex gap-3 rounded-2xl bg-surface p-3 shadow-sm shadow-black/5">
      {meal.photo && (
        <img src={meal.photo} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
      )}
      <button className="flex-1 text-left" onClick={onView}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="min-w-0 flex-1 truncate font-medium text-ink">{meal.title}</h3>
          <span className="shrink-0 rounded-full bg-kcal/15 px-2.5 py-1 text-xs font-bold text-ink">
            {Math.round(meal.nutrition.kcal)} kcal
          </span>
        </div>
        <div className="mt-1.5 flex gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold text-ink ${MACRO_BADGE_BG.protein}`}>
            P {Math.round(meal.nutrition.protein)}g
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold text-ink ${MACRO_BADGE_BG.carbs}`}>
            K {Math.round(meal.nutrition.carbs)}g
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold text-ink ${MACRO_BADGE_BG.fat}`}>
            F {Math.round(meal.nutrition.fat)}g
          </span>
        </div>
      </button>
      <div className="flex shrink-0 flex-col items-end justify-between">
        {confirmingDelete ? (
          <div className="flex gap-1">
            <button
              onClick={() => deleteMeal(meal.id)}
              className="rounded-full bg-danger px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
            >
              Löschen
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              className="rounded-full bg-bg px-2.5 py-1 text-xs text-ink-soft hover:bg-line"
            >
              Abbrechen
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingDelete(true)}
            aria-label="Mahlzeit löschen"
            className="text-ink-faint hover:text-danger"
          >
            <TrashIcon />
          </button>
        )}
      </div>
    </div>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <path strokeLinecap="round" d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 .8 12.2A2 2 0 0 0 8.8 21h6.4a2 2 0 0 0 2-1.8L18 7" />
    </svg>
  )
}
