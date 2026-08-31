import { useState } from 'react'
import { formatIngredientAmount, MEAL_TYPE_LABELS, MICRONUTRIENT_LABELS, type Meal } from '../lib/db'
import { getBodyProfile } from '../lib/bodyProfile'
import { notableMicronutrients } from '../lib/micronutrients'
import { MacroBadge, MacroRingBadge } from './MacroBadge'
import { Sheet } from './Sheet'
import { Collapse } from './Collapse'
import { InfoButton } from './InfoButton'

export function MealDetail({
  meal,
  onClose,
  onEdit,
}: {
  meal: Meal
  onClose: () => void
  onEdit: () => void
}) {
  // The scroll lives on the inner wrapper, not on the sheet itself: the sheet's
  // own chrome (the drag handle Sheet renders) has to stay put while the
  // content scrolls under it — on a scrolling sheet element it would scroll
  // out of reach with the first swipe.
  return (
    <Sheet
      onClose={onClose}
      sheetClassName="glass flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl"
    >
      <div className="flex min-h-0 flex-col overflow-y-auto p-5 pt-7">
        <MealDetailContent meal={meal} onEdit={onEdit} />
      </div>
    </Sheet>
  )
}

function MealDetailContent({ meal, onEdit }: { meal: Meal; onEdit: () => void }) {
  const [descriptionOpen, setDescriptionOpen] = useState(false)
  const [ingredientsOpen, setIngredientsOpen] = useState(false)

  // Requires a body profile (for sex, which iron's reference value needs) —
  // same gate the rolling Statistik bands use. Meals logged before
  // micronutrient estimation existed, or added without ever running the AI
  // estimate, simply show no badges rather than a misleading empty state.
  const bodyProfile = getBodyProfile()
  const notableKeys = meal.micronutrients && bodyProfile ? notableMicronutrients(meal.micronutrients, bodyProfile.sex) : []

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-medium text-ink-soft">{MEAL_TYPE_LABELS[meal.mealType]}</span>
      </div>

      {meal.photo && <img src={meal.photo} alt="" className="mb-4 h-44 w-full rounded-2xl object-cover" />}

      <h2 className="mb-3 text-xl font-semibold text-ink">{meal.title}</h2>

      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <MacroBadge type="kcal" value={meal.nutrition.kcal} />
        <MacroRingBadge type="protein" value={meal.nutrition.protein} />
        <MacroRingBadge type="carbs" value={meal.nutrition.carbs} />
        <MacroRingBadge type="fat" value={meal.nutrition.fat} />
      </div>

      {/* Mikronährstoffe treated as meal-detail-only information rather
          than a Feed-level summary, per the same brainstorm this shipped
          from — a per-meal "notable source of" read, not the weekly band
          the Statistik page shows (see lib/micronutrients.ts for why the
          two use different rules). */}
      {notableKeys.length > 0 && (
        <div className="mb-5">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-soft">Gute Quelle für</span>
          <div className="flex flex-wrap gap-1.5">
            {notableKeys.map((key) => (
              <span key={key} className="rounded-full bg-good/15 px-2.5 py-1 text-xs font-medium text-good">
                {MICRONUTRIENT_LABELS[key]}
              </span>
            ))}
          </div>
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
          <Collapse open={descriptionOpen}>
            <p className="mt-2 text-sm text-ink-soft">{meal.description}</p>
          </Collapse>
        </div>
      )}

      {meal.ingredients && meal.ingredients.length > 0 && (
        <div className="mb-5">
          <button
            onClick={() => setIngredientsOpen((v) => !v)}
            className="flex w-full items-center justify-between text-left text-xs font-semibold uppercase tracking-wide text-ink-soft"
          >
            Zutaten
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              className={`h-4 w-4 transition-transform ${ingredientsOpen ? 'rotate-180' : ''}`}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
            </svg>
          </button>
          <Collapse open={ingredientsOpen}>
            <div className="mt-2 flex flex-col gap-2.5">
              {meal.ingredients.map((ing, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-ink">{ing.name}</span>
                    <span className="shrink-0 text-xs text-ink-soft">{formatIngredientAmount(ing)}</span>
                  </div>
                  <p className="text-xs text-ink-faint">
                    {Math.round(ing.kcal)} kcal · {Math.round(ing.protein)}g Protein ·{' '}
                    {Math.round(ing.carbs)}g Carbs · {Math.round(ing.fat)}g Fett
                  </p>
                  {ing.note && <p className="mt-0.5 text-xs italic text-ink-soft">{ing.note}</p>}
                </div>
              ))}
              {meal.manuallyEdited && (
                <div className="mt-2 flex justify-end">
                  <InfoButton label="Warum weicht die Zutatenliste ab?" title="Manuell angepasst">
                    Hinweis: Die Nährwerte oben wurden manuell angepasst — die Zutatenliste zeigt weiterhin die
                    ursprüngliche KI-Schätzung und summiert sich ggf. nicht mehr exakt darauf.
                  </InfoButton>
                </div>
              )}
            </div>
          </Collapse>
        </div>
      )}

      {meal.note && <p className="mb-5 text-xs italic text-ink-soft">Hinweis der KI: {meal.note}</p>}

      <button onClick={onEdit} className="glass-accent rounded-2xl px-4 py-3 text-sm font-semibold transition">
        Bearbeiten
      </button>
    </>
  )
}
