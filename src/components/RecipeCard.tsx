import { useState } from 'react'
import type { Recipe } from '../lib/db'
import { deleteRecipe } from '../hooks/useRecipes'
import { MacroBadge, MacroRingBadge } from './MacroBadge'

/** A recipe row in the Rezepte category list — same pill layout as MealCard, minus the photo (recipes never have one). */
export function RecipeCard({ recipe, onView }: { recipe: Recipe; onView: () => void }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  return (
    <div className="rounded-2xl bg-surface p-3 shadow-sm shadow-black/5">
      <button className="block w-full text-left" onClick={onView}>
        <h3 className="font-medium text-ink">{recipe.title}</h3>
      </button>
      <div className="mt-1.5 flex items-center gap-1.5">
        <button className="flex min-w-0 flex-1 flex-wrap gap-1.5 text-left" onClick={onView}>
          <MacroBadge type="kcal" value={recipe.nutrition.kcal} size="sm" />
          <MacroRingBadge type="protein" value={recipe.nutrition.protein} size="sm" />
          <MacroRingBadge type="carbs" value={recipe.nutrition.carbs} size="sm" />
          <MacroRingBadge type="fat" value={recipe.nutrition.fat} size="sm" />
        </button>
        {confirmingDelete ? (
          <div className="flex shrink-0 gap-1">
            <button
              onClick={() => deleteRecipe(recipe.id)}
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
            aria-label="Rezept löschen"
            className="shrink-0 text-ink-faint hover:text-danger"
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
