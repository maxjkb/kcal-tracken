import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MEAL_TYPE_LABELS, MEAL_TYPE_ORDER, toLocalDateKey, type Meal } from '../lib/db'
import { ChevronIcon } from '../components/ChevronIcon'
import { PageHeader } from '../components/PageHeader'
import { MealTypeBadge } from '../components/MealTypeBadge'
import { MacroBadge } from '../components/MacroBadge'
import { BouncingDots } from '../components/BouncingDots'
import { RecipeEditor, type RecipeSeed } from '../components/RecipeEditor'
import { useRecentMeals, useMealsInRange } from '../hooks/useMeals'
import { useAllRecipes } from '../hooks/useRecipes'
import { estimateRecipeSuggestions, GeminiError, type RecipeSuggestion } from '../lib/gemini'
import { getApiKey } from '../lib/settings'
import { getBodyProfile, computeDailyTargets } from '../lib/bodyProfile'
import { guessMealType } from '../lib/mealTypeGuess'
import { rankFrequentIngredients, SUGGESTION_HISTORY_DAYS } from '../lib/mealSuggestions'
import { GlassSurface } from '../glass/GlassSurface'

/** How many recently logged meals "Zuletzt" shows — three fits comfortably below the four
  * category tiles without the page feeling crowded; picked over showing all/many since these are
  * meant as quick, glanceable starting points, not another full list to scroll through. */
const RECENT_MEALS_COUNT = 3
const SUGGESTION_PERIOD_DAYS = 14
/** How many of the most-repeated ingredients from the longer cooking history get named to the model. */
const FREQUENT_INGREDIENT_COUNT = 8

type EditorRequest = { kind: 'meal'; meal: Meal } | { kind: 'seed'; seed: RecipeSeed }

/** The Rezepte root — one row per meal-type category (matching the Einstellungen menu's list
  * style), plus two lower-key sections that turn the page's previously-empty lower half into
  * useful shortcuts: "Zuletzt" (recently logged meals, one tap from becoming a saved recipe) and
  * "Vorschläge" (AI recipe ideas grounded in actual recent eating habits, refreshed on request). */
export function RecipesPage() {
  const recentMeals = useRecentMeals(RECENT_MEALS_COUNT)
  const [editorRequest, setEditorRequest] = useState<EditorRequest | null>(null)

  // No SlideInPage here, unlike the two Rezepte drill-downs: this is a section
  // root, and SwipeNavigator already animates it in from whichever side the
  // gesture came from. SlideInPage's unconditional "from the right" would send
  // it the wrong way whenever you swipe *back* into Rezepte.
  return (
    <>
      <div className="mx-auto max-w-lg px-4 pb-28">
        <PageHeader title="Rezepte" />

        <GlassSurface rim={22} className="glass-subtle glass-subtle-themed divide-y divide-line/60 overflow-hidden rounded-3xl shadow-sm shadow-black/5">
          {MEAL_TYPE_ORDER.map((type) => (
            <Link
              key={type}
              to={`/recipes/${type}`}
              className="flex items-center gap-3 px-4 py-3.5 active:bg-bg/60"
            >
              <MealTypeBadge type={type} />
              <span className="flex-1 text-sm font-medium text-ink">{MEAL_TYPE_LABELS[type]}</span>
              <ChevronIcon direction="right" className="h-4 w-4 shrink-0 text-ink-faint" />
            </Link>
          ))}
        </GlassSurface>

        {recentMeals && recentMeals.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Zuletzt</h2>
            <GlassSurface rim={22} className="glass-subtle glass-subtle-themed flex flex-col divide-y divide-line/60 overflow-hidden rounded-3xl">
              {recentMeals.map((meal) => (
                <button
                  key={meal.id}
                  type="button"
                  onClick={() => setEditorRequest({ kind: 'meal', meal })}
                  className="flex items-center gap-3 px-4 py-3 text-left"
                >
                  <MealTypeBadge type={meal.mealType} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{meal.title}</p>
                    <p className="text-xs text-ink-soft">{MEAL_TYPE_LABELS[meal.mealType]}</p>
                  </div>
                  <MacroBadge type="kcal" value={meal.nutrition.kcal} size="sm" />
                </button>
              ))}
            </GlassSurface>
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
    </>
  )
}

function SuggestionsSection({ onPick }: { onPick: (seed: RecipeSeed) => void }) {
  const [todayKey] = useState(() => toLocalDateKey(new Date()))
  const [startKey] = useState(() => toLocalDateKey(new Date(Date.now() - (SUGGESTION_PERIOD_DAYS - 1) * 86_400_000)))
  const recentMealsForAi = useMealsInRange(startKey, todayKey)
  // A separate, much longer window purely for the ingredient-frequency
  // signal — SUGGESTION_HISTORY_DAYS (90d) is what actually shows a
  // "regularly eats this" pattern; the 14-day window above answers a
  // different question ("what's been logged lately") and would barely
  // catch a once-a-week habit.
  const [historyStartKey] = useState(() => toLocalDateKey(new Date(Date.now() - (SUGGESTION_HISTORY_DAYS - 1) * 86_400_000)))
  const mealsForIngredientHistory = useMealsInRange(historyStartKey, todayKey)
  const existingRecipes = useAllRecipes()
  const hasApiKey = Boolean(getApiKey())

  const [suggestions, setSuggestions] = useState<RecipeSuggestion[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRefresh() {
    setLoading(true)
    setError(null)
    try {
      const bodyProfile = getBodyProfile()
      const todaysMeals = (recentMealsForAi ?? []).filter((m) => m.date === todayKey)
      const consumedToday = todaysMeals.reduce(
        (acc, m) => ({
          kcal: acc.kcal + m.nutrition.kcal,
          protein: acc.protein + m.nutrition.protein,
          carbs: acc.carbs + m.nutrition.carbs,
          fat: acc.fat + m.nutrition.fat,
        }),
        { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      )

      const result = await estimateRecipeSuggestions({
        recentMealSummaries: (recentMealsForAi ?? []).map((m) => `${MEAL_TYPE_LABELS[m.mealType]}: ${m.title}`),
        existingRecipeTitles: (existingRecipes ?? []).map((r) => r.title),
        currentSlotLabel: MEAL_TYPE_LABELS[guessMealType()],
        dailyTargets: bodyProfile ? computeDailyTargets(bodyProfile) : null,
        consumedToday,
        frequentIngredients: rankFrequentIngredients(mealsForIngredientHistory ?? [], FREQUENT_INGREDIENT_COUNT),
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
          className="-my-3.5 flex items-center gap-1 py-3.5 text-xs font-medium text-accent disabled:cursor-not-allowed disabled:opacity-40"
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
            <GlassSurface as="div" key={s.title} rim={22} className="glass-subtle flex flex-col gap-2 rounded-3xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-ink">{s.title}</p>
                    {s.novelty === 'new' && (
                      <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                        Neu für dich
                      </span>
                    )}
                  </div>
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
            </GlassSurface>
          ))}
        </div>
      )}
    </div>
  )
}
