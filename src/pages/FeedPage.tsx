import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useMeal, useMealsForDate } from '../hooks/useMeals'
import { MEAL_TYPE_LABELS, MEAL_TYPE_ORDER, toLocalDateKey, type Meal, type MealType } from '../lib/db'
import { MealCard } from '../components/MealCard'
import { MealEditor } from '../components/MealEditor'
import { MealDetail } from '../components/MealDetail'
import { MiniNutrientRings } from '../components/NutrientRings'
import { RemainingHero } from '../components/RemainingHero'
import { DayPickerModal } from '../components/DatePickerModal'
import { Collapse } from '../components/Collapse'
import { MealTypeBadge } from '../components/MealTypeBadge'
import { computeDailyTargets, getBodyProfile } from '../lib/bodyProfile'
import { PageHeader } from '../components/PageHeader'
import { TipsButton } from '../components/TipsSheet'
import { GlassSurface } from '../glass/GlassSurface'

function sumNutrition(meals: Meal[]) {
  return meals.reduce(
    (acc, m) => ({
      kcal: acc.kcal + m.nutrition.kcal,
      protein: acc.protein + m.nutrition.protein,
      carbs: acc.carbs + m.nutrition.carbs,
      fat: acc.fat + m.nutrition.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )
}

function addDays(dateKey: string, delta: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + delta)
  return toLocalDateKey(date)
}

function formatDateHeading(dateKey: string): string {
  const todayKey = toLocalDateKey(new Date())
  const yesterdayKey = addDays(todayKey, -1)
  if (dateKey === todayKey) return 'Heute'
  if (dateKey === yesterdayKey) return 'Gestern'
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  })
}

export function FeedPage() {
  // Arriving here via a Stats drill-down (clicking a day in the Woche chart)
  // passes the target day through router state — otherwise default to today.
  const location = useLocation()
  const drillDownDateKey = (location.state as { dateKey?: string } | null)?.dateKey
  const [dateKey, setDateKey] = useState(() => drillDownDateKey ?? toLocalDateKey(new Date()))
  const meals = useMealsForDate(dateKey)
  const [editorState, setEditorState] = useState<
    { mode: 'closed' } | { mode: 'edit'; meal: Meal } | { mode: 'view'; meal: Meal }
  >({ mode: 'closed' })
  // Live, not just `editorState.meal` itself: after MealEditor's onClose
  // hands back to 'view' (see below), that snapshot is still the pre-edit
  // meal — this re-reads the just-saved data. Falls back to the snapshot
  // while the query is still resolving, so there's no loading flash.
  const viewedMeal = useMeal(editorState.mode === 'view' ? editorState.meal.id : undefined)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<MealType, boolean>>({
    breakfast: false,
    lunch: false,
    dinner: false,
    snack: false,
  })

  const isToday = dateKey === toLocalDateKey(new Date())
  const totals = (meals ?? []).reduce(
    (acc, m) => ({
      kcal: acc.kcal + m.nutrition.kcal,
      protein: acc.protein + m.nutrition.protein,
      carbs: acc.carbs + m.nutrition.carbs,
      fat: acc.fat + m.nutrition.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )

  const bodyProfile = getBodyProfile()
  const targets = bodyProfile ? computeDailyTargets(bodyProfile) : null

  const mealsByType = (meals ?? []).reduce<Record<MealType, Meal[]>>(
    (acc, m) => {
      acc[m.mealType].push(m)
      return acc
    },
    { breakfast: [], lunch: [], dinner: [], snack: [] },
  )

  return (
    <div className="mx-auto max-w-lg px-4 pb-28">
      {/* The page IS the day, so the title carries it — "Heute" normally, the
          actual date when looking at another one. That leaves nothing for a
          separate heading below to add: it used to repeat the very same word
          under a page called "Feed", which is the duplication this removes.
          Tapping the title still opens the calendar, so no way of changing
          the day is lost along with the line. */}
      <PageHeader
        title={formatDateHeading(dateKey)}
        actions={isToday && <TipsButton />}
        onTitleClick={() => setPickerOpen(true)}
      />

      <GlassSurface rim={26} className="glass-subtle glass-subtle-themed mb-6 rounded-3xl p-5 shadow-sm shadow-black/5">
        <RemainingHero kcal={totals.kcal} protein={totals.protein} carbs={totals.carbs} fat={totals.fat} targets={targets} />
      </GlassSurface>

      {meals === undefined ? (
        <p className="text-center text-sm text-ink-soft">Lädt…</p>
      ) : (
        <div className="flex flex-col gap-6">
          {MEAL_TYPE_ORDER.map((type) => {
            const typeMeals = mealsByType[type]
            const isOpen = !collapsed[type]
            return (
              <section key={type}>
                <div className="mb-2 flex items-center gap-2">
                  <MealTypeBadge type={type} size="sm" />
                  <h2 className="text-lg font-semibold text-ink">{MEAL_TYPE_LABELS[type]}</h2>
                  {typeMeals.length > 0 && (
                    <button
                      onClick={() => setCollapsed((c) => ({ ...c, [type]: !c[type] }))}
                      aria-label={isOpen ? `${MEAL_TYPE_LABELS[type]} einklappen` : `${MEAL_TYPE_LABELS[type]} ausklappen`}
                      className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-bg"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.2}
                        className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                  )}
                </div>
                <Collapse open={isOpen && typeMeals.length > 0}>
                  <div className="flex flex-col gap-2">
                    {typeMeals.map((meal) => (
                      <MealCard key={meal.id} meal={meal} onView={() => setEditorState({ mode: 'view', meal })} />
                    ))}
                  </div>
                </Collapse>
                {/* Collapsed sections still show at a glance what was logged, as a
                    compact ring row summing this category's totals for the day —
                    it disappears again once expanded, since the meal cards below
                    then show the same numbers. */}
                <Collapse open={!isOpen && typeMeals.length > 0}>
                  <MiniNutrientRings {...sumNutrition(typeMeals)} />
                </Collapse>
              </section>
            )
          })}
        </div>
      )}

      {pickerOpen && (
        <DayPickerModal
          selectedDateKey={dateKey}
          onSelect={(key) => {
            setDateKey(key)
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {editorState.mode === 'view' && (
        <MealDetail
          meal={viewedMeal ?? editorState.meal}
          onClose={() => setEditorState({ mode: 'closed' })}
          onEdit={() => setEditorState({ mode: 'edit', meal: editorState.meal })}
        />
      )}

      {editorState.mode === 'edit' && (
        <MealEditor
          date={dateKey}
          initial={editorState.meal}
          // Back to 'view', not 'closed': this editor was reached from
          // MealDetail's own "Bearbeiten", so closing it (swipe-down,
          // handle tap, or a completed save — all funnel through the same
          // Sheet onClose) should return to that view, the "Hauptseite" of
          // this two-step flow, not skip past it to the Feed underneath.
          // App.tsx's own `addingMeal` MealEditor has no view to return to
          // and keeps its plain onClose.
          onClose={() => setEditorState({ mode: 'view', meal: editorState.meal })}
        />
      )}
    </div>
  )
}
