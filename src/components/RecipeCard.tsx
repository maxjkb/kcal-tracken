import { useState } from 'react'
import type { Recipe } from '../lib/db'
import { deleteRecipe } from '../hooks/useRecipes'
import { MacroBadge, MacroRingBadge } from './MacroBadge'
import { GlassSurface } from '../glass/GlassSurface'

/**
 * A recipe row in the Rezepte category list.
 *
 * Bigger and airier than the previous version — that one packed the title,
 * four macro badges and a delete icon into a single 12px-padded strip, which
 * was the concrete source of the "zu eng / Schrift zu klein" complaint on
 * this page. Same information, same two-control layout (view vs. delete, as
 * before — a <button> can't nest another <button>), just given room:
 * a full-width title line at the normal body size, and a step/ingredient
 * count underneath so the card shows more than a number before it's opened.
 */
export function RecipeCard({ recipe, onView }: { recipe: Recipe; onView: () => void }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const ingredientCount = (recipe.ingredients ?? []).length
  const stepCount = (recipe.steps ?? []).length

  return (
    <GlassSurface rim={22} className="press-card glass-subtle glass-subtle-themed rounded-3xl p-4 shadow-sm shadow-black/5">
      <button className="press-target block w-full text-left" onClick={onView}>
        <h3 className="text-base font-semibold text-ink">{recipe.title}</h3>
        {/* `?? []` on both: a recipe row read back from IndexedDB is not
            guaranteed to match the declared type (a half-written import, an
            AI extraction that failed mid-save), and reading .length off the
            missing array threw right here — taking the whole category page
            down with it, not just this one card. */}
        <p className="mt-0.5 text-xs text-ink-soft">
          {ingredientCount} {ingredientCount === 1 ? 'Zutat' : 'Zutaten'}
          {stepCount > 0 && ` · ${stepCount} ${stepCount === 1 ? 'Schritt' : 'Schritte'}`}
        </p>
      </button>
      <div className="mt-3 flex items-center gap-2">
        <button className="press-target flex min-w-0 flex-1 flex-wrap gap-1.5 text-left" onClick={onView}>
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
    </GlassSurface>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <path strokeLinecap="round" d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 .8 12.2A2 2 0 0 0 8.8 21h6.4a2 2 0 0 0 2-1.8L18 7" />
    </svg>
  )
}
