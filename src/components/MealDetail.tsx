import { MEAL_TYPE_LABELS, type Meal } from '../lib/db'

const MACRO_BADGE_BG: Record<'protein' | 'carbs' | 'fat', string> = {
  protein: 'bg-protein/15',
  carbs: 'bg-carbs/15',
  fat: 'bg-fat/15',
}

export function MealDetail({
  meal,
  onClose,
  onEdit,
}: {
  meal: Meal
  onClose: () => void
  onEdit: () => void
}) {
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
          <span className={`rounded-full px-3 py-1.5 text-sm font-semibold text-ink ${MACRO_BADGE_BG.protein}`}>
            P {Math.round(meal.nutrition.protein)}g
          </span>
          <span className={`rounded-full px-3 py-1.5 text-sm font-semibold text-ink ${MACRO_BADGE_BG.carbs}`}>
            K {Math.round(meal.nutrition.carbs)}g
          </span>
          <span className={`rounded-full px-3 py-1.5 text-sm font-semibold text-ink ${MACRO_BADGE_BG.fat}`}>
            F {Math.round(meal.nutrition.fat)}g
          </span>
        </div>

        {meal.ingredients && meal.ingredients.length > 0 ? (
          <div className="mb-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Zutaten</h3>
            <div className="flex flex-col gap-2">
              {meal.ingredients.map((ing, i) => (
                <div key={i} className="rounded-2xl border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink">{ing.name}</span>
                    <span className="shrink-0 text-xs text-ink-soft">{ing.amount}</span>
                  </div>
                  <div className="mt-1.5 flex gap-3 text-xs text-ink-soft">
                    <span>{Math.round(ing.kcal)} kcal</span>
                    <span>P {Math.round(ing.protein)}g</span>
                    <span>K {Math.round(ing.carbs)}g</span>
                    <span>F {Math.round(ing.fat)}g</span>
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
        ) : (
          meal.description && (
            <div className="mb-5">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Beschreibung</h3>
              <p className="text-sm text-ink-soft">{meal.description}</p>
            </div>
          )
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
