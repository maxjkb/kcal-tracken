import { useState } from 'react'
import type { Meal } from '../lib/db'
import { deleteMeal } from '../hooks/useMeals'

export function MealCard({ meal, onEdit }: { meal: Meal; onEdit: () => void }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  return (
    <div className="flex gap-3 rounded-2xl bg-surface p-3 shadow-sm shadow-black/5">
      {meal.photo && (
        <img src={meal.photo} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
      )}
      <button className="flex-1 text-left" onClick={onEdit}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium text-ink">{meal.title}</h3>
          <span className="shrink-0 rounded-full bg-kcal/15 px-2.5 py-1 text-xs font-bold text-ink">
            {Math.round(meal.nutrition.kcal)} kcal
          </span>
        </div>
        {meal.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-ink-soft">{meal.description}</p>
        )}
        <div className="mt-1.5 flex gap-3 text-xs text-ink-soft">
          <span>P {Math.round(meal.nutrition.protein)}g</span>
          <span>K {Math.round(meal.nutrition.carbs)}g</span>
          <span>F {Math.round(meal.nutrition.fat)}g</span>
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
