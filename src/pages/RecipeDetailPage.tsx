import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatIngredientAmount } from '../lib/db'
import { useRecipe } from '../hooks/useRecipes'
import { RecipeEditor } from '../components/RecipeEditor'
import { ChevronIcon } from '../components/ChevronIcon'
import { MacroBadge, MacroRingBadge } from '../components/MacroBadge'
import { SlideInPage } from '../components/SlideInPage'
import { Collapse } from '../components/Collapse'

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  )
}

/** One recipe's detail — Zutaten and Zubereitung, matching MealDetail's read-only/collapsible pattern; "Bearbeiten" opens the recipe editor. */
export function RecipeDetailPage() {
  const { id } = useParams<{ category: string; id: string }>()
  const recipe = useRecipe(id)
  const [ingredientsOpen, setIngredientsOpen] = useState(true)
  const [stepsOpen, setStepsOpen] = useState(false)
  const [editing, setEditing] = useState(false)

  if (!recipe) {
    return (
      <div className="mx-auto max-w-lg px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
        <p className="py-10 text-center text-sm text-ink-soft">Lädt…</p>
      </div>
    )
  }

  return (
    <SlideInPage>
      <div className="mx-auto max-w-lg px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
        <div className="mb-4">
          <Link
            to={`/recipes/${recipe.category}`}
            aria-label="Zurück"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-ink-soft shadow-sm shadow-black/5 hover:text-ink"
          >
            <ChevronIcon direction="left" />
          </Link>
        </div>

        <h2 className="mb-3 text-xl font-semibold text-ink">{recipe.title}</h2>

        <div className="mb-5 flex flex-wrap items-center gap-2.5">
          <MacroBadge type="kcal" value={recipe.nutrition.kcal} />
          <MacroRingBadge type="protein" value={recipe.nutrition.protein} />
          <MacroRingBadge type="carbs" value={recipe.nutrition.carbs} />
          <MacroRingBadge type="fat" value={recipe.nutrition.fat} />
        </div>

        {recipe.ingredients.length > 0 && (
          <div className="mb-5">
            <button
              onClick={() => setIngredientsOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left text-xs font-semibold uppercase tracking-wide text-ink-soft"
            >
              Zutaten
              <ChevronDown open={ingredientsOpen} />
            </button>
            <Collapse open={ingredientsOpen}>
              <div className="mt-2 flex flex-col gap-2.5">
                {recipe.ingredients.map((ing, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-ink">{ing.name}</span>
                      <span className="shrink-0 text-xs text-ink-soft">{formatIngredientAmount(ing)}</span>
                    </div>
                    <p className="text-xs text-ink-faint">
                      {Math.round(ing.kcal)} kcal · {Math.round(ing.protein)}g Protein · {Math.round(ing.carbs)}g Carbs ·{' '}
                      {Math.round(ing.fat)}g Fett
                    </p>
                    {ing.note && <p className="mt-0.5 text-xs italic text-ink-soft">{ing.note}</p>}
                  </div>
                ))}
              </div>
            </Collapse>
          </div>
        )}

        {recipe.steps.length > 0 && (
          <div className="mb-5">
            <button
              onClick={() => setStepsOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left text-xs font-semibold uppercase tracking-wide text-ink-soft"
            >
              Zubereitung
              <ChevronDown open={stepsOpen} />
            </button>
            <Collapse open={stepsOpen}>
              <ol className="mt-2 flex flex-col gap-2">
                {recipe.steps.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-ink">
                    <span className="shrink-0 font-semibold text-ink-faint">{i + 1}.</span>
                    <span>{s.text}</span>
                  </li>
                ))}
              </ol>
            </Collapse>
          </div>
        )}

        <button onClick={() => setEditing(true)} className="glass-accent rounded-2xl px-4 py-2.5 text-sm font-semibold transition">
          Bearbeiten
        </button>
      </div>

      {editing && <RecipeEditor category={recipe.category} initial={recipe} onClose={() => setEditing(false)} />}
    </SlideInPage>
  )
}
