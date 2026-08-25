import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import {
  SUPPLEMENT_CATEGORY_LABELS,
  SUPPLEMENT_TIME_LABELS,
  toLocalDateKey,
  type MySupplement,
  type Supplement,
} from '../lib/db'
import { SUPPLEMENT_CATEGORY_ORDER } from '../lib/supplementSeed'
import {
  addSuggestionToMyList,
  useAllSupplements,
  useMySupplements,
  useSupplementLogForDate,
} from '../hooks/useSupplements'
import { useMealsInRange } from '../hooks/useMeals'
import { computeDailyTargets, getBodyProfile, GOAL_LABELS } from '../lib/bodyProfile'
import {
  estimateSupplementRecommendations,
  GeminiError,
  type SupplementRecommendation,
} from '../lib/gemini'
import { getApiKey } from '../lib/settings'
import { SupplementChecklistRow } from '../components/SupplementChecklist'
import { SupplementFormSheet } from '../components/SupplementFormSheet'
import { BouncingDots } from '../components/BouncingDots'
import { SPRING_SNAPPY } from '../lib/motionTokens'

type Tab = 'today' | 'catalog' | 'suggestions'
const TABS: { key: Tab; label: string }[] = [
  { key: 'today', label: 'Heute' },
  { key: 'catalog', label: 'Katalog' },
  { key: 'suggestions', label: 'Vorschläge' },
]

const RECOMMENDATION_PERIOD_DAYS = 14

export function SupplementsPage() {
  const [tab, setTab] = useState<Tab>('today')
  const prefersReducedMotion = useReducedMotion()

  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <h1 className="mb-4 text-2xl font-bold tracking-tight text-ink">Supplements</h1>

      <div className="glass-subtle glass-subtle-themed mb-5 flex gap-1.5 rounded-full p-1.5 shadow-sm shadow-black/5">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`relative flex-1 rounded-full py-2 text-sm font-medium transition-colors ${
              tab === key ? 'text-ink' : 'text-ink-soft hover:text-ink'
            }`}
          >
            {tab === key && (
              <motion.span
                layoutId="supplements-tab-pill"
                className="absolute inset-0 rounded-full bg-section-20"
                transition={prefersReducedMotion ? { duration: 0 } : SPRING_SNAPPY}
              />
            )}
            <span className="relative z-10">{label}</span>
          </button>
        ))}
      </div>

      {tab === 'today' && <TodayTab />}
      {tab === 'catalog' && <CatalogTab />}
      {tab === 'suggestions' && <SuggestionsTab />}

      {/* text-ink-soft, not text-ink-faint: this is real content someone needs to
          actually read, not a decorative icon — ink-faint only clears the 3:1
          bar for non-text UI (3.26:1 in light mode), while body text needs 4.5:1
          (apple-hig-review: Accessibility — minimum contrast). */}
      <p className="mt-8 text-center text-[11px] leading-relaxed text-ink-soft">
        Diese Vorschläge basieren auf deinen geloggten Daten und allgemein bekannten Zusammenhängen — sie sind keine
        medizinische Beratung. Bei Vorerkrankungen, Medikamenten oder Schwangerschaft vorher ärztlich abklären.
      </p>
    </div>
  )
}

function TodayTab() {
  const todayKey = toLocalDateKey(new Date())
  const mySupplements = useMySupplements()
  const supplements = useAllSupplements()
  const logEntries = useSupplementLogForDate(todayKey)
  const [editing, setEditing] = useState<MySupplement | null>(null)

  const supplementById = new Map((supplements ?? []).map((s) => [s.id, s]))

  return (
    <div className="flex flex-col gap-2.5">
      {mySupplements === undefined || logEntries === undefined ? (
        <p className="py-10 text-center text-sm text-ink-soft">Lädt…</p>
      ) : mySupplements.length === 0 ? (
        <div className="glass-subtle glass-subtle-themed flex flex-col items-center gap-3 rounded-3xl px-6 py-10 text-center">
          <p className="text-sm text-ink-soft">
            Noch keine Supplements auf deiner Liste. Füge welche über den Katalog hinzu, oder lass dir unter
            „Vorschläge" welche empfehlen.
          </p>
        </div>
      ) : (
        mySupplements.map((my) => (
          <SupplementChecklistRow
            key={my.id}
            mySupplement={my}
            supplement={supplementById.get(my.supplementId)}
            date={todayKey}
            logEntries={logEntries}
            onEdit={() => setEditing(my)}
          />
        ))
      )}

      {editing && (
        <SupplementFormSheet
          editing={{ mySupplement: editing, supplement: supplementById.get(editing.supplementId) }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function CatalogTab() {
  const supplements = useAllSupplements()
  const mySupplements = useMySupplements()
  const [adding, setAdding] = useState<Supplement | null>(null)
  const [addingCustom, setAddingCustom] = useState(false)

  const myBySupplementId = new Map((mySupplements ?? []).map((m) => [m.supplementId, m]))

  return (
    <div className="flex flex-col gap-5">
      {supplements === undefined ? (
        <p className="py-10 text-center text-sm text-ink-soft">Lädt…</p>
      ) : (
        SUPPLEMENT_CATEGORY_ORDER.map((category) => {
          const inCategory = supplements.filter((s) => s.category === category)
          if (inCategory.length === 0) return null
          return (
            <div key={category}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                {SUPPLEMENT_CATEGORY_LABELS[category]}
              </h2>
              <div className="glass-subtle glass-subtle-themed flex flex-col divide-y divide-line/60 overflow-hidden rounded-3xl">
                {inCategory.map((s) => {
                  const already = myBySupplementId.has(s.id)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setAdding(s)}
                      className="flex items-start justify-between gap-3 px-4 py-3 text-left"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">{s.name}</p>
                        {s.description && <p className="mt-0.5 text-xs text-ink-soft">{s.description}</p>}
                        <p className="mt-0.5 text-xs text-ink-soft">{s.typicalDosage}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          already ? 'bg-accent/12 text-accent' : 'bg-bg text-ink-soft'
                        }`}
                      >
                        {already ? 'Auf Liste' : 'Hinzufügen'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })
      )}

      <button
        type="button"
        onClick={() => setAddingCustom(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line py-3 text-sm font-medium text-ink-soft hover:bg-bg"
      >
        + Eigenes Supplement
      </button>

      {adding && <SupplementFormSheet supplement={adding} onClose={() => setAdding(null)} />}
      {addingCustom && <SupplementFormSheet onClose={() => setAddingCustom(false)} />}
    </div>
  )
}

function SuggestionsTab() {
  const mySupplements = useMySupplements()
  const supplements = useAllSupplements()
  const [todayKey] = useState(() => toLocalDateKey(new Date()))
  const [startKey] = useState(() => toLocalDateKey(new Date(Date.now() - (RECOMMENDATION_PERIOD_DAYS - 1) * 86_400_000)))
  const meals = useMealsInRange(startKey, todayKey)
  const hasApiKey = Boolean(getApiKey())

  const [suggestions, setSuggestions] = useState<SupplementRecommendation[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addedNames, setAddedNames] = useState<Set<string>>(new Set())

  async function handleRefresh() {
    setLoading(true)
    setError(null)
    try {
      const bodyProfile = getBodyProfile()
      const targets = bodyProfile ? computeDailyTargets(bodyProfile) : null
      const days = Math.max(1, new Set((meals ?? []).map((m) => m.date)).size)
      const totals = (meals ?? []).reduce(
        (acc, m) => ({
          kcal: acc.kcal + m.nutrition.kcal,
          protein: acc.protein + m.nutrition.protein,
          carbs: acc.carbs + m.nutrition.carbs,
          fat: acc.fat + m.nutrition.fat,
        }),
        { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      )
      const supplementById = new Map((supplements ?? []).map((s) => [s.id, s]))
      const alreadyTaking = (mySupplements ?? [])
        .map((m) => supplementById.get(m.supplementId)?.name)
        .filter((n): n is string => Boolean(n))

      const result = await estimateSupplementRecommendations({
        goalLabel: bodyProfile ? GOAL_LABELS[bodyProfile.goal] : 'Kein Ziel hinterlegt',
        dailyTargets: targets,
        averageIntake: {
          kcal: totals.kcal / days,
          protein: totals.protein / days,
          carbs: totals.carbs / days,
          fat: totals.fat / days,
        },
        periodDays: days,
        alreadyTaking,
      })
      setSuggestions(result)
      setAddedNames(new Set())
    } catch (err) {
      setError(err instanceof GeminiError ? err.message : 'Unbekannter Fehler bei der Empfehlung.')
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(s: SupplementRecommendation) {
    await addSuggestionToMyList(s)
    setAddedNames((current) => new Set(current).add(s.supplementName))
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={handleRefresh}
        disabled={loading || !hasApiKey}
        className="glass-accent flex items-center justify-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? <BouncingDots /> : suggestions ? 'Empfehlungen aktualisieren' : 'Empfehlungen abrufen'}
      </button>

      {!hasApiKey && <p className="text-xs text-ink-soft">Kein API-Key hinterlegt — in den Einstellungen eintragen.</p>}
      {error && <p className="text-sm font-medium text-danger">{error}</p>}

      {suggestions !== null && suggestions.length === 0 && (
        <p className="py-6 text-center text-sm text-ink-soft">Aktuell keine neuen Vorschläge.</p>
      )}

      {suggestions?.map((s) => {
        const added = addedNames.has(s.supplementName)
        return (
          <div key={s.supplementName} className="glass-subtle flex flex-col gap-2 rounded-3xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">{s.supplementName}</p>
                <p className="text-xs text-ink-soft">{SUPPLEMENT_CATEGORY_LABELS[s.category]}</p>
              </div>
              <button
                type="button"
                onClick={() => handleAdd(s)}
                disabled={added}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  added ? 'bg-bg text-ink-soft' : 'bg-accent/12 text-accent hover:bg-accent/20'
                }`}
              >
                {added ? 'Hinzugefügt' : 'Zur Liste hinzufügen'}
              </button>
            </div>
            <p className="text-sm text-ink-soft">{s.reasoning}</p>
            <p className="text-xs text-ink-soft">
              {s.suggestedDosage} · {s.suggestedTimesOfDay.map((t) => SUPPLEMENT_TIME_LABELS[t]).join(', ')}
            </p>
          </div>
        )
      })}
    </div>
  )
}
