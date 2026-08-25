import { useState } from 'react'
import type { Meal } from '../lib/db'
import { deleteMeal } from '../hooks/useMeals'
import { MacroBadge, MacroRingBadge } from './MacroBadge'

export function MealCard({ meal, onView }: { meal: Meal; onView: () => void }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  return (
    <div className="press-card glass-subtle rounded-2xl p-3 shadow-sm shadow-black/5">
      <div className="flex gap-3">
        {meal.photo && (
          <img src={meal.photo} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <button className="press-target block w-full py-1 text-left" onClick={onView}>
            <h3 className="font-medium text-ink">{meal.title}</h3>
          </button>
          <div className="mt-1.5 flex items-center gap-1.5">
            <button className="press-target flex min-w-0 flex-1 flex-wrap gap-1.5 text-left" onClick={onView}>
              <MacroBadge type="kcal" value={meal.nutrition.kcal} size="sm" />
              <MacroRingBadge type="protein" value={meal.nutrition.protein} size="sm" />
              <MacroRingBadge type="carbs" value={meal.nutrition.carbs} size="sm" />
              <MacroRingBadge type="fat" value={meal.nutrition.fat} size="sm" />
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
                // -m-3 p-3 grows the target to 44px without moving the icon or
                // taking any extra room in the row: the padding reaches out,
                // the negative margin pulls the box back. At 20x20 this was the
                // smallest target in the app.
                className="-m-3 shrink-0 p-3 text-ink-faint hover:text-danger"
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
