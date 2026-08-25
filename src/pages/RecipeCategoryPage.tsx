import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { MEAL_TYPE_LABELS, MEAL_TYPE_ORDER, type MealType } from '../lib/db'
import { useRecipesForCategory } from '../hooks/useRecipes'
import { RecipeCard } from '../components/RecipeCard'
import { RecipeEditor } from '../components/RecipeEditor'
import { ChevronIcon } from '../components/ChevronIcon'
import { SlideInPage } from '../components/SlideInPage'
import { MealTypeIcon } from '../components/MealTypeIcon'
import { useRegisterBackSwipe } from '../lib/backSwipe'

function isMealType(value: string | undefined): value is MealType {
  return !!value && (MEAL_TYPE_ORDER as string[]).includes(value)
}

/** One category's saved recipes — reached from the Rezepte root; "Hinzufügen" opens the recipe editor pre-set to this category. */
export function RecipeCategoryPage() {
  const { category } = useParams<{ category: string }>()
  const navigate = useNavigate()
  // Swiping right means what the back arrow above means.
  useRegisterBackSwipe(() => navigate('/recipes'))
  const cat: MealType = isMealType(category) ? category : 'breakfast'
  const recipes = useRecipesForCategory(cat)
  const [adding, setAdding] = useState(false)

  return (
    <SlideInPage>
      <div className="mx-auto max-w-lg px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
        <div className="mb-4 flex items-center gap-3">
          <Link
            to="/recipes"
            aria-label="Zurück zu Rezepte"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink-soft shadow-sm shadow-black/5 hover:text-ink"
          >
            <ChevronIcon direction="left" />
          </Link>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-section-12 text-section">
            <MealTypeIcon type={cat} className="h-4 w-4" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{MEAL_TYPE_LABELS[cat]}</h1>
        </div>

        {recipes === undefined ? (
          <p className="py-10 text-center text-sm text-ink-soft">Lädt…</p>
        ) : recipes.length === 0 ? (
          <div className="glass-subtle glass-subtle-themed flex flex-col items-center gap-3 rounded-3xl px-6 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-section-12 text-section">
              <MealTypeIcon type={cat} className="h-6 w-6" />
            </span>
            <p className="text-sm text-ink-soft">Noch keine Rezepte in dieser Kategorie.</p>
          </div>
        ) : (
          <div className="mb-4 flex flex-col gap-2">
            {recipes.map((r) => (
              <RecipeCard key={r.id} recipe={r} onView={() => navigate(`/recipes/${cat}/${r.id}`)} />
            ))}
          </div>
        )}

        <button onClick={() => setAdding(true)} className="glass-accent w-full rounded-2xl px-4 py-2.5 text-sm font-semibold">
          Hinzufügen
        </button>
      </div>

      {adding && <RecipeEditor category={cat} onClose={() => setAdding(false)} />}
    </SlideInPage>
  )
}
