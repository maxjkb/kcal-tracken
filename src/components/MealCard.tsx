import { useState } from 'react'
import type { Meal } from '../lib/db'
import { deleteMeal } from '../hooks/useMeals'
import { MacroBadge } from './MacroBadge'

export function MealCard({ meal, onView }: { meal: Meal; onView: () => void }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  return (
    <div className="rounded-2xl bg-surface p-3 shadow-sm shadow-black/5">
      <div className="flex gap-3">
        {meal.photo && (
          <img src={meal.photo} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <button className="block w-full text-left" onClick={onView}>
            <h3 className="font-medium text-ink">{meal.title}</h3>
          </button>
          <div className="mt-1.5 flex items-center gap-1.5">
            <button className="flex min-w-0 flex-1 flex-wrap gap-1.5 text-left" onClick={onView}>
              <MacroBadge type="kcal" value={meal.nutrition.kcal} size="sm" />
              <MacroBadge type="protein" value={meal.nutrition.protein} size="sm" />
              <MacroBadge type="carbs" value={meal.nutrition.carbs} size="sm" />
              <MacroBadge type="fat" value={meal.nutrition.fat} size="sm" />
            </button>
            {confirmingDelete ? (
              <div className="flex shrink-0 gap-1">
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
                className="shrink-0 text-ink-faint hover:text-danger"
              >
                <TrashIcon />
              </button>
            )}
          </div>
        </div>
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
