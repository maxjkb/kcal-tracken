import { useState } from 'react'
import { MEAL_TYPE_LABELS, type Meal } from '../lib/db'
import { MacroBadge } from './MacroBadge'

export function MealDetail({
  meal,
  onClose,
  onEdit,
}: {
  meal: Meal
  onClose: () => void
  onEdit: () => void
}) {
  const [descriptionOpen, setDescriptionOpen] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 backdrop-blur-sm sm:items-center">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs font-medium text-ink-soft">{MEAL_TYPE_LABELS[meal.mealType]}</span>
          <button onClick={onClose} className="text-ink-soft hover:text-ink" aria-label="Schließen">
            ✕
          </button>
        </div>

        {meal.photo && (
          <img src={meal.photo} alt="" className="mb-4 h-44 w-full rounded-2xl object-cover" />
        )}

        <h2 className="mb-3 text-xl font-semibold text-ink">{meal.title}</h2>

        <div className="mb-5 flex flex-wrap gap-2">
          <span className="rounded-full bg-kcal/15 px-3 py-1.5 text-sm font-bold text-ink">
            {Math.round(meal.nutrition.kcal)} kcal
          </span>
          <MacroBadge type="protein" value={meal.nutrition.protein} />
          <MacroBadge type="carbs" value={meal.nutrition.carbs} />
          <MacroBadge type="fat" value={meal.nutrition.fat} />
        </div>

        {meal.ingredients && meal.ingredients.length > 0 && (
          <div className="mb-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Zutaten</h3>
            <div className="flex flex-col gap-2">
              {meal.ingredients.map((ing, i) => (
                <div key={i} className="rounded-2xl border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink">{ing.name}</span>
                    <span className="shrink-0 text-xs text-ink-soft">{ing.amount}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-kcal/15 px-2 py-0.5 text-[11px] font-semibold text-ink">
                      {Math.round(ing.kcal)} kcal
                    </span>
                    <MacroBadge type="protein" value={ing.protein} size="sm" />
                    <MacroBadge type="carbs" value={ing.carbs} size="sm" />
                    <MacroBadge type="fat" value={ing.fat} size="sm" />
                  </div>
                  {ing.note && <p className="mt-1.5 text-xs italic text-ink-soft">{ing.note}</p>}
                </div>
              ))}
            </div>
            {meal.manuallyEdited && (
              <p className="mt-2 text-xs text-ink-faint">
                Hinweis: Die Nährwerte oben wurden manuell angepasst — die Zutatenliste zeigt weiterhin die
                ursprüngliche KI-Schätzung und summiert sich ggf. nicht mehr exakt darauf.
              </p>
            )}
          </div>
        )}

        {meal.description && (
          <div className="mb-5">
            <button
              onClick={() => setDescriptionOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left text-xs font-semibold uppercase tracking-wide text-ink-soft"
            >
              Beschreibung
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                className={`h-4 w-4 transition-transform ${descriptionOpen ? 'rotate-180' : ''}`}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {descriptionOpen && <p className="mt-2 text-sm text-ink-soft">{meal.description}</p>}
          </div>
        )}

        {meal.note && <p className="mb-5 text-xs italic text-ink-soft">Hinweis der KI: {meal.note}</p>}

        <button
          onClick={onEdit}
          className="glass-accent rounded-2xl px-4 py-2.5 text-sm font-semibold transition"
        >
          Bearbeiten
        </button>
      </div>
    </div>
  )
}
