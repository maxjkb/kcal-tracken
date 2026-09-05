import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { MEAL_TYPE_LABELS, MEAL_TYPE_ORDER, type MealType } from '../lib/db'
import { useRecipesForCategory } from '../hooks/useRecipes'
import { RecipeCard } from '../components/RecipeCard'
import { RecipeEditor } from '../components/RecipeEditor'
import { ChevronIcon } from '../components/ChevronIcon'
import { SlideInPage } from '../components/SlideInPage'
import { MealTypeBadge } from '../components/MealTypeBadge'
import { MEAL_TYPE_COLOR } from '../lib/mealTypeColor'
import { useRegisterBackSwipe } from '../lib/backSwipe'
import { GlassSurface } from '../glass/GlassSurface'

function isMealType(value: string | undefined): value is MealType {
  return !!value && (MEAL_TYPE_ORDER as string[]).includes(value)
}

/**
 * One category's saved recipes — reached from the Rezepte root.
 *
 * The header is now a colored hero band (the same meal-type color as its
 * CategoryTile on the root, so the two visibly belong together) rather than
 * a plain back-arrow-and-title line — one of the "keine optischen Elemente"
 * fixes: the previous header was indistinguishable from any other sub-page's.
 * "Hinzufügen" opens the recipe editor pre-set to this category.
 */
export function RecipeCategoryPage() {
  const { category } = useParams<{ category: string }>()
  const navigate = useNavigate()
  // Swiping right means what the back arrow above means.
  useRegisterBackSwipe(() => navigate('/recipes'))
  const cat: MealType = isMealType(category) ? category : 'breakfast'
  const recipes = useRecipesForCategory(cat)
  const [adding, setAdding] = useState(false)
  const color = MEAL_TYPE_COLOR[cat]

  return (
    <SlideInPage>
      <div className="mx-auto max-w-lg px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
        <div
          className="relative mb-5 overflow-hidden rounded-3xl p-5 shadow-sm shadow-black/5"
          style={{ background: `color-mix(in srgb, ${color} 16%, var(--color-bg))` }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full opacity-25 blur-2xl"
            style={{ background: color }}
          />
          <div className="relative z-10 flex items-center gap-3">
            <Link
              to="/recipes"
              aria-label="Zurück zu Rezepte"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-ink-soft shadow-sm shadow-black/5 hover:text-ink"
            >
              <ChevronIcon direction="left" />
            </Link>
            <MealTypeBadge type={cat} size="lg" />
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{MEAL_TYPE_LABELS[cat]}</h1>
              <p className="text-xs text-ink-soft">
                {recipes === undefined
                  ? 'Lädt…'
                  : recipes.length === 0
                    ? 'Noch keine Rezepte'
                    : recipes.length === 1
                      ? '1 Rezept'
                      : `${recipes.length} Rezepte`}
              </p>
            </div>
          </div>
        </div>

        {recipes === undefined ? (
          <p className="py-10 text-center text-sm text-ink-soft">Lädt…</p>
        ) : recipes.length === 0 ? (
          <GlassSurface rim={26} className="glass-subtle glass-subtle-themed flex flex-col items-center gap-3 rounded-3xl px-6 py-10 text-center">
            <MealTypeBadge type={cat} size="lg" />
            <p className="text-sm text-ink-soft">Noch keine Rezepte in dieser Kategorie.</p>
          </GlassSurface>
        ) : (
          <div className="mb-4 flex flex-col gap-2.5">
            {recipes.map((r) => (
              <RecipeCard key={r.id} recipe={r} onView={() => navigate(`/recipes/${cat}/${r.id}`)} />
            ))}
          </div>
        )}

        <button onClick={() => setAdding(true)} className="glass-accent flex w-full items-center justify-center gap-1.5 rounded-2xl px-4 py-3 text-sm font-semibold">
          <PlusIcon />
          Hinzufügen
        </button>
      </div>

      {adding && <RecipeEditor category={cat} onClose={() => setAdding(false)} />}
    </SlideInPage>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="h-4 w-4">
      <path strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  )
}
