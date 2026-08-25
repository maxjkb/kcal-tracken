import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MEAL_TYPE_LABELS, MEAL_TYPE_ORDER, toLocalDateKey, type Meal } from '../lib/db'
import { ChevronIcon } from '../components/ChevronIcon'
import { SlideInPage } from '../components/SlideInPage'
import { MealTypeIcon } from '../components/MealTypeIcon'
import { MacroBadge } from '../components/MacroBadge'
import { BouncingDots } from '../components/BouncingDots'
import { RecipeEditor, type RecipeSeed } from '../components/RecipeEditor'
import { useRecentMeals, useMealsInRange } from '../hooks/useMeals'
import { useAllRecipes } from '../hooks/useRecipes'
import { estimateRecipeSuggestions, GeminiError, type RecipeSuggestion } from '../lib/gemini'
import { getApiKey } from '../lib/settings'

/** How many recently logged meals "Zuletzt" shows — three fits comfortably below the four
  * category tiles without the page feeling crowded; picked over showing all/many since these are
  * meant as quick, glanceable starting points, not another full list to scroll through. */
const RECENT_MEALS_COUNT = 3
const SUGGESTION_PERIOD_DAYS = 14

type EditorRequest = { kind: 'meal'; meal: Meal } | { kind: 'seed'; seed: RecipeSeed }

/** The Rezepte root — one row per meal-type category (matching the Einstellungen menu's list
  * style), plus two lower-key sections that turn the page's previously-empty lower half into
  * useful shortcuts: "Zuletzt" (recently logged meals, one tap from becoming a saved recipe) and
  * "Vorschläge" (AI recipe ideas grounded in actual recent eating habits, refreshed on request). */
export function RecipesPage() {
  const recentMeals = useRecentMeals(RECENT_MEALS_COUNT)
  const [editorRequest, setEditorRequest] = useState<EditorRequest | null>(null)

  return (
    <SlideInPage>
      <div className="mx-auto max-w-lg px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
        <h1 className="mb-4 text-2xl font-bold tracking-tight text-ink">Rezepte</h1>

        <div className="glass-subtle divide-y divide-line/60 overflow-hidden rounded-3xl shadow-sm shadow-black/5">
          {MEAL_TYPE_ORDER.map((type) => (
            <Link
              key={type}
              to={`/recipes/${type}`}
              className="flex items-center gap-3 px-4 py-3.5 active:bg-bg/60"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
                <MealTypeIcon type={type} />
              </span>
              <span className="flex-1 text-sm font-medium text-ink">{MEAL_TYPE_LABELS[type]}</span>
              <ChevronIcon direction="right" className="h-4 w-4 shrink-0 text-ink-faint" />
            </Link>
          ))}
        </div>

        {recentMeals && recentMeals.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Zuletzt</h2>
            <div className="glass-subtle flex flex-col divide-y divide-line/60 overflow-hidden rounded-3xl">
              {recentMeals.map((meal) => (
                <button
                  key={meal.id}
                  type="button"
                  onClick={() => setEditorRequest({ kind: 'meal', meal })}
                  className="flex items-center gap-3 px-4 py-3 text-left"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
                    <MealTypeIcon type={meal.mealType} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{meal.title}</p>
                    <p className="text-xs text-ink-soft">{MEAL_TYPE_LABELS[meal.mealType]}</p>
                  </div>
                  <MacroBadge type="kcal" value={meal.nutrition.kcal} size="sm" />
                </button>
              ))}
            </div>
            {/* text-ink-soft, not text-ink-faint: real instructional text needs the 4.5:1 text
                contrast bar, which ink-faint (tuned for icons/dots at the looser 3:1 bar) doesn't
                clear in light mode — same fix already applied on the Supplements page. */}
            <p className="mt-2 text-xs text-ink-soft">
              Antippen übernimmt die Mahlzeit als Ausgangspunkt für ein neues Rezept.
            </p>
          </div>
        )}

        <SuggestionsSection onPick={(seed) => setEditorRequest({ kind: 'seed', seed })} />
      </div>

      {editorRequest?.kind === 'meal' && (
        <RecipeEditor category={editorRequest.meal.mealType} fromMeal={editorRequest.meal} onClose={() => setEditorRequest(null)} />
      )}
      {editorRequest?.kind === 'seed' && (
        <RecipeEditor category={editorRequest.seed.category} seed={editorRequest.seed} onClose={() => setEditorRequest(null)} />
      )}
    </SlideInPage>
  )
}

function SuggestionsSection({ onPick }: { onPick: (seed: RecipeSeed) => void }) {
  const [todayKey] = useState(() => toLocalDateKey(new Date()))
  const [startKey] = useState(() => toLocalDateKey(new Date(Date.now() - (SUGGESTION_PERIOD_DAYS - 1) * 86_400_000)))
  const recentMealsForAi = useMealsInRange(startKey, todayKey)
  const existingRecipes = useAllRecipes()
  const hasApiKey = Boolean(getApiKey())

  const [suggestions, setSuggestions] = useState<RecipeSuggestion[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRefresh() {
    setLoading(true)
    setError(null)
    try {
      const result = await estimateRecipeSuggestions({
        recentMealSummaries: (recentMealsForAi ?? []).map((m) => `${MEAL_TYPE_LABELS[m.mealType]}: ${m.title}`),
        existingRecipeTitles: (existingRecipes ?? []).map((r) => r.title),
      })
      setSuggestions(result)
    } catch (err) {
      setError(err instanceof GeminiError ? err.message : 'Unbekannter Fehler bei den Rezept-Ideen.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Vorschläge</h2>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading || !hasApiKey}
          className="flex items-center gap-1 text-xs font-medium text-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? <BouncingDots /> : suggestions ? 'Aktualisieren' : 'Ideen abrufen'}
        </button>
      </div>

      {!hasApiKey && <p className="text-xs text-ink-soft">Kein API-Key hinterlegt — in den Einstellungen eintragen.</p>}
      {error && <p className="text-sm font-medium text-danger">{error}</p>}
      {suggestions !== null && suggestions.length === 0 && (
        <p className="py-4 text-center text-xs text-ink-soft">Aktuell keine neuen Ideen.</p>
      )}

      {suggestions && suggestions.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {suggestions.map((s) => (
            <div key={s.title} className="glass-subtle flex flex-col gap-2 rounded-3xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{s.title}</p>
                  <p className="text-xs text-ink-soft">{MEAL_TYPE_LABELS[s.category]}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onPick({ title: s.title, description: s.description, category: s.category })}
                  className="shrink-0 rounded-full bg-accent/12 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/20"
                >
                  Als Rezept anlegen
                </button>
              </div>
              <p className="text-sm text-ink-soft">{s.reasoning}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
