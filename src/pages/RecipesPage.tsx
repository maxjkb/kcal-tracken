import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MEAL_TYPE_LABELS, MEAL_TYPE_ORDER, toLocalDateKey, type Meal, type MealType } from '../lib/db'
import { PageHeader } from '../components/PageHeader'
import { MealTypeBadge } from '../components/MealTypeBadge'
import { MealTypeIcon } from '../components/MealTypeIcon'
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
import { MEAL_TYPE_COLOR } from '../lib/mealTypeColor'
import { GlassSurface } from '../glass/GlassSurface'
import { InfoButton } from '../components/InfoButton'

/** How many recently logged meals "Zuletzt" shows — three fits comfortably below the four
  * category tiles without the page feeling crowded; picked over showing all/many since these are
  * meant as quick, glanceable starting points, not another full list to scroll through. */
const RECENT_MEALS_COUNT = 3
const SUGGESTION_PERIOD_DAYS = 14
/** How many of the most-repeated ingredients from the longer cooking history get named to the model. */
const FREQUENT_INGREDIENT_COUNT = 8

type EditorRequest = { kind: 'meal'; meal: Meal } | { kind: 'seed'; seed: RecipeSeed }

/**
 * The Rezepte root.
 *
 * Redesigned from a single flat menu list (four thin rows, all identical
 * except for a tiny icon) into four large, individually colored tiles — the
 * "zu textlastig / keine optischen Elemente / langweilig" complaint was
 * specifically about this page reading as a settings-style list rather than
 * a place for food. Each tile now carries its own meal-type color as a soft
 * glow (see CategoryTile below), the same color the app already uses for
 * that meal type everywhere else (badges, MealCard) — nothing new was
 * invented, it's just finally large enough to register as an eyecatcher
 * instead of a 20px dot.
 *
 * "Zuletzt" and "Vorschläge" below keep their previous structure and
 * behavior exactly, just at the larger type size and card-per-item spacing
 * the rest of this pass uses — no new interaction to relearn there.
 */
export function RecipesPage() {
  const recentMeals = useRecentMeals(RECENT_MEALS_COUNT)
  const allRecipes = useAllRecipes()
  const [editorRequest, setEditorRequest] = useState<EditorRequest | null>(null)

  const countByCategory = new Map<MealType, number>()
  for (const r of allRecipes ?? []) {
    countByCategory.set(r.category, (countByCategory.get(r.category) ?? 0) + 1)
  }

  // No SlideInPage here, unlike the two Rezepte drill-downs: this is a section
  // root, and SwipeNavigator already animates it in from whichever side the
  // gesture came from. SlideInPage's unconditional "from the right" would send
  // it the wrong way whenever you swipe *back* into Rezepte.
  return (
    <>
      <div className="mx-auto max-w-lg px-4 pb-28">
        <PageHeader title="Rezepte" />

        <div className="grid grid-cols-2 gap-3">
          {MEAL_TYPE_ORDER.map((type) => (
            <CategoryTile key={type} type={type} count={countByCategory.get(type) ?? 0} />
          ))}
        </div>

        {recentMeals && recentMeals.length > 0 && (
          <div className="mt-7">
            <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">Zuletzt</h2>
            <div className="flex flex-col gap-2.5">
              {recentMeals.map((meal) => (
                <GlassSurface
                  as="button"
                  key={meal.id}
                  type="button"
                  rim={20}
                  onClick={() => setEditorRequest({ kind: 'meal', meal })}
                  className="press-card glass-subtle flex w-full items-center gap-3 rounded-2xl p-3.5 text-left shadow-sm shadow-black/5"
                >
                  <MealTypeBadge type={meal.mealType} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{meal.title}</p>
                    <p className="text-xs text-ink-soft">{MEAL_TYPE_LABELS[meal.mealType]}</p>
                  </div>
                  <MacroBadge type="kcal" value={meal.nutrition.kcal} size="sm" />
                </GlassSurface>
              ))}
            </div>
            {/* text-ink-soft, not text-ink-faint: real instructional text needs the 4.5:1 text
                contrast bar, which ink-faint (tuned for icons/dots at the looser 3:1 bar) doesn't
                clear in light mode — same fix already applied on the Supplements page. */}
            <div className="mb-2 flex justify-end">
              <InfoButton label="Was passiert beim Antippen?" title="Aus Mahlzeit ein Rezept machen">
                Antippen übernimmt die Mahlzeit als Ausgangspunkt für ein neues Rezept.
              </InfoButton>
            </div>
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

/**
 * One of the four meal-type tiles on the Rezepte root.
 *
 * A single `<Link>` rather than the app's usual "two controls" pattern
 * (SettingsRow, RecipeCard): the whole tile does exactly one thing — open
 * that category — so there's no second control competing for the tap.
 *
 * The color blob is a decorative, absolutely-positioned layer behind the
 * content rather than an inline `background` on the tile itself: `.glass-
 * subtle`'s own `background` shorthand (the frosted-material look) would
 * otherwise just be overwritten outright by a second inline `background`
 * on the same element, losing the glass effect entirely. Layering a
 * separate blurred circle keeps both.
 */
function CategoryTile({ type, count }: { type: MealType; count: number }) {
  const color = MEAL_TYPE_COLOR[type]
  return (
    <GlassSurface
      as={Link}
      to={`/recipes/${type}`}
      rim={26}
      className="press-card glass-subtle glass-subtle-themed relative flex flex-col gap-3 overflow-hidden rounded-3xl p-4 shadow-sm shadow-black/5"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-5 -top-5 h-20 w-20 rounded-full opacity-30 blur-xl"
        style={{ background: color }}
      />
      <div className="relative z-10 flex flex-col gap-3">
        <MealTypeBadge type={type} size="lg" />
        <div>
          <p className="text-base font-bold text-ink">{MEAL_TYPE_LABELS[type]}</p>
          <p className="text-xs text-ink-soft">{count === 0 ? 'Noch keine Rezepte' : count === 1 ? '1 Rezept' : `${count} Rezepte`}</p>
        </div>
      </div>
    </GlassSurface>
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
    <div className="mt-7">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">
          <SparkleIcon className="h-3.5 w-3.5 text-section" />
          Vorschläge
        </h2>
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
            <GlassSurface as="div" key={s.title} rim={24} className="glass-subtle glass-subtle-themed flex flex-col gap-2.5 rounded-3xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-section-12 text-section">
                    <MealTypeIcon type={s.category} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-base font-semibold text-ink">{s.title}</p>
                      {s.novelty === 'new' && (
                        <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                          Neu für dich
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink-soft">{MEAL_TYPE_LABELS[s.category]}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onPick({ title: s.title, description: s.description, category: s.category })}
                  className="shrink-0 rounded-full bg-accent/12 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/20"
                >
                  Als Rezept anlegen
                </button>
              </div>
              <p className="text-sm leading-relaxed text-ink-soft">{s.reasoning}</p>
            </GlassSurface>
          ))}
        </div>
      )}
    </div>
  )
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2.5c.35 3.4 1.1 5.6 2.3 6.8s3.4 1.95 6.8 2.3c-3.4.35-5.6 1.1-6.8 2.3s-1.95 3.4-2.3 6.8c-.35-3.4-1.1-5.6-2.3-6.8S6.3 12.05 2.9 11.6c3.4-.35 5.6-1.1 6.8-2.3s1.95-3.4 2.3-6.8Z" />
    </svg>
  )
}
