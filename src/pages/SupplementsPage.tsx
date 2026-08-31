import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import {
  SUPPLEMENT_CATEGORY_LABELS,
  SUPPLEMENT_TIME_LABELS,
  toLocalDateKey,
  type MySupplement,
  type Supplement,
  type SupplementRecommendation,
} from '../lib/db'
import { SUPPLEMENT_CATEGORY_ORDER } from '../lib/supplementSeed'
import { PageHeader } from '../components/PageHeader'
import { StaggeredList } from '../components/StaggeredList'
import {
  addMySupplement,
  addSuggestionToMyList,
  removeMySupplement,
  useAllSupplements,
  useLatestAdvisorRun,
  useMySupplements,
  useSupplementLogForDate,
} from '../hooks/useSupplements'
import { generateAdvisorRun } from '../lib/supplementAdvisor'
import { GeminiError } from '../lib/gemini'
import { getApiKey } from '../lib/settings'
import { SupplementChecklistRow } from '../components/SupplementChecklist'
import { SupplementFormSheet } from '../components/SupplementFormSheet'
import { SupplementChatSheet } from '../components/SupplementChatSheet'
import { SPRING_SNAPPY } from '../lib/motionTokens'
import { GlassSurface } from '../glass/GlassSurface'

type Tab = 'today' | 'catalog' | 'suggestions'
const TABS: { key: Tab; label: string }[] = [
  { key: 'today', label: 'Heute' },
  { key: 'catalog', label: 'Katalog' },
  { key: 'suggestions', label: 'Vorschläge' },
]

export function SupplementsPage() {
  const [tab, setTab] = useState<Tab>('today')
  const prefersReducedMotion = useReducedMotion()

  return (
    <div className="mx-auto max-w-lg px-4 pb-28">
      <PageHeader title="Supplements" />

      {/* Full .glass, not .glass-subtle — a segmented control is navigation
          the same way BottomNav is, so it gets the same material. */}
      <GlassSurface rim={22} className="glass mb-5 flex gap-1.5 rounded-full p-1.5 shadow-sm shadow-black/5">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`relative flex-1 rounded-full py-3 text-sm font-medium transition-colors ${
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
      </GlassSurface>

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
        <GlassSurface rim={26} className="glass-subtle glass-subtle-themed flex flex-col items-center gap-3 rounded-3xl px-6 py-10 text-center">
          <p className="text-sm text-ink-soft">
            Noch keine Supplements auf deiner Liste. Füge welche über den Katalog hinzu, oder lass dir unter
            „Vorschläge" welche empfehlen.
          </p>
        </GlassSurface>
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
  const [query, setQuery] = useState('')

  const myBySupplementId = new Map((mySupplements ?? []).map((m) => [m.supplementId, m]))

  // Matches the description too, not just the name: the catalog is browsed by
  // problem at least as often as by product ("Schlaf", "Gelenke"), and someone
  // who doesn't already know a supplement's name can't search for it.
  const needle = query.trim().toLowerCase()
  const visible = needle
    ? (supplements ?? []).filter(
        (s) => s.name.toLowerCase().includes(needle) || s.description.toLowerCase().includes(needle),
      )
    : (supplements ?? [])

  return (
    <div className="flex flex-col gap-5">
      <div className="relative">
        <GlassSurface
          as="input"
          rim={20}
          type="search"
          value={query}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          placeholder="Katalog durchsuchen…"
          aria-label="Katalog durchsuchen"
          className="glass-subtle glass-subtle-themed w-full rounded-2xl py-2.5 pl-10 pr-3 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft" aria-hidden="true">
          <SearchIcon />
        </span>
      </div>

      {supplements === undefined ? (
        <p className="py-10 text-center text-sm text-ink-soft">Lädt…</p>
      ) : visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-soft">
          Nichts gefunden für „{query.trim()}". Du kannst es unten als eigenes Supplement anlegen.
        </p>
      ) : (
        SUPPLEMENT_CATEGORY_ORDER.map((category) => {
          const inCategory = visible.filter((s) => s.category === category)
          if (inCategory.length === 0) return null
          return (
            <div key={category}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                {SUPPLEMENT_CATEGORY_LABELS[category]}
              </h2>
              <GlassSurface rim={22} className="glass-subtle glass-subtle-themed flex flex-col divide-y divide-line/60 overflow-hidden rounded-3xl">
                {inCategory.map((s) => {
                  const mySupplement = myBySupplementId.get(s.id)
                  const already = mySupplement !== undefined
                  return (
                    // Two independent controls, not one — the row used to be a single
                    // <button> that opened the dosage/timing sheet on any tap. Splitting
                    // it lets the +/- toggle add or remove in one tap with sensible
                    // defaults (below), while tapping the name/description still opens
                    // the sheet to actually set a dosage or times of day. A <button>
                    // can't legally nest another <button> anyway (see SlotButton's
                    // comment in SupplementChecklist.tsx for the same constraint).
                    <div key={s.id} className="flex items-start justify-between gap-3 px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setAdding(s)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="text-sm font-medium text-ink">{s.name}</p>
                        {s.description && <p className="mt-0.5 text-xs text-ink-soft">{s.description}</p>}
                        <p className="mt-0.5 text-xs text-ink-soft">{s.typicalDosage}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          already
                            ? removeMySupplement(mySupplement.id)
                            : addMySupplement({ supplementId: s.id, dosage: s.typicalDosage, timesOfDay: ['morning'] })
                        }
                        aria-label={already ? `${s.name} von der Liste entfernen` : `${s.name} zur Liste hinzufügen`}
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
                          already ? 'bg-danger/12 text-danger hover:bg-danger/20' : 'bg-accent/12 text-accent hover:bg-accent/20'
                        }`}
                      >
                        {already ? <MinusIcon /> : <PlusIcon />}
                      </button>
                    </div>
                  )
                })}
              </GlassSurface>
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

/**
 * Read-only view of the standing recommendation.
 *
 * There is no "generate" button any more: the run happens once a day on app
 * start (see lib/supplementAdvisor.ts), which is the whole point of storing
 * past runs — a list the user could re-roll at will could never be consistent,
 * because re-rolling is exactly what makes it change. What's left is a
 * discreet retry for the case where the automatic run couldn't complete.
 */
function SuggestionsTab() {
  const run = useLatestAdvisorRun()
  const hasApiKey = Boolean(getApiKey())
  const catalog = useAllSupplements()
  const mySupplements = useMySupplements()

  const [retrying, setRetrying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chatSuggestion, setChatSuggestion] = useState<SupplementRecommendation | null>(null)

  async function handleRetry() {
    setRetrying(true)
    setError(null)
    try {
      await generateAdvisorRun()
    } catch (err) {
      // Logged either way, so remote-debugging or a browser console can see
      // the real stack — not just what's shown in the UI.
      console.error('Supplement-Empfehlung fehlgeschlagen:', err)
      // Anything that isn't a GeminiError used to collapse into a single,
      // generic "Unbekannter Fehler" with no way to tell what actually
      // broke — a bug in the surrounding analysis code (Dexie, a malformed
      // record) looked identical to a network hiccup. Appending the raw
      // message/value makes the next occurrence diagnosable from a
      // screenshot instead of a dead end.
      setError(
        err instanceof GeminiError
          ? err.message
          : `Unbekannter Fehler bei der Empfehlung: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setRetrying(false)
    }
  }

  async function handleAdd(s: SupplementRecommendation) {
    await addSuggestionToMyList(s)
    // No local "added" bookkeeping needed: useMySupplements() below is a
    // live Dexie query, so the moment this write lands, myNormalizedNames
    // picks it up and the filter a few lines down drops the suggestion from
    // the list on its own — the actual "darf nicht mehr auftauchen" rule,
    // not just a disabled button that forgets on reload.
  }

  if (!hasApiKey) {
    return (
      <p className="py-8 text-center text-sm text-ink-soft">
        Für Vorschläge wird ein Gemini-API-Key benötigt — in den Einstellungen eintragen.
      </p>
    )
  }

  if (run === undefined) return <p className="py-10 text-center text-sm text-ink-soft">Lädt…</p>

  // Same name-normalization addSuggestionToMyList itself matches an existing
  // catalog entry by. Only filters out kind="new" suggestions — "consistency"
  // and "no_longer_needed" *reference* an existing routine entry by design,
  // so being on the list is exactly why they exist, not a reason to hide them.
  const myNames = new Set(
    (mySupplements ?? [])
      .map((my) => (catalog ?? []).find((c) => c.id === my.supplementId)?.name.trim().toLowerCase())
      .filter((name): name is string => Boolean(name)),
  )
  const suggestions = (run?.suggestions ?? []).filter(
    (s) => s.kind !== 'new' || !myNames.has(s.supplementName.trim().toLowerCase()),
  )

  return (
    <div className="flex flex-col gap-4">
      {run && (
        <p className="text-xs text-ink-soft">
          Stand {formatRunDate(run.date)} · aktualisiert sich einmal täglich automatisch
        </p>
      )}

      {error && <p className="text-sm font-medium text-danger">{error}</p>}

      {run === null && !error && (
        <p className="py-6 text-center text-sm text-ink-soft">
          Noch keine Vorschläge. Sie werden beim nächsten Start der App automatisch erstellt.
        </p>
      )}

      {run !== null && suggestions.length === 0 && (
        <p className="py-6 text-center text-sm text-ink-soft">
          Aktuell keine Vorschläge — deine Ernährung und deine Supplement-Routine geben gerade nichts her.
        </p>
      )}

      <StaggeredList className="flex flex-col gap-4">
      {suggestions.map((s) => {
        const isConsistency = s.kind === 'consistency'
        const isNoLongerNeeded = s.kind === 'no_longer_needed'
        return (
          <div key={s.supplementName} className="glass-subtle flex flex-col gap-2.5 rounded-3xl p-4">
            <div className="flex items-start justify-between gap-3">
              {/* Opens the KI-Chat, seeded with this card's own reasoning/effects
                  text as the opening message — see SupplementChatSheet. A <button>,
                  not the whole card: the +/pill control on the same row needs to
                  stay its own, sibling tap target (a <button> can't legally nest
                  another one), same constraint CatalogTab's rows already solve. */}
              <button type="button" onClick={() => setChatSuggestion(s)} className="min-w-0 flex-1 text-left" aria-label={`Chat zu ${s.supplementName} öffnen`}>
                <p className="text-sm font-semibold text-ink">{s.supplementName}</p>
                <p className="text-xs text-ink-soft">{SUPPLEMENT_CATEGORY_LABELS[s.category]}</p>
              </button>
              {/* A consistency item is already on the list — offering "add" would
                  duplicate it, and the ask is to take it, not to acquire it.
                  Same reasoning for "nicht mehr notwendig": it's already on the
                  list too, just being flagged for the opposite reason. A plain
                  "new" suggestion gets the +-icon toggle everywhere else in this
                  page already uses (CatalogTab) — no text label, since it's never
                  ambiguous what a lone "+" on a supplement card means. There is
                  no "-" state to toggle back to here: accepting a suggestion is
                  one-directional, and the card itself disappears the moment it's
                  added (see the myNames filter above), so there's never a moment
                  where a "-" would have anything to remove. */}
              {isConsistency ? (
                <span className="shrink-0 rounded-full bg-section-12 px-3 py-1.5 text-xs font-semibold text-section">
                  Schon auf der Liste
                </span>
              ) : isNoLongerNeeded ? (
                <span className="shrink-0 rounded-full bg-danger/12 px-3 py-1.5 text-xs font-semibold text-danger">
                  Nicht mehr notwendig
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleAdd(s)}
                  aria-label={`${s.supplementName} zur Liste hinzufügen`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent transition hover:bg-accent/20"
                >
                  <PlusIcon />
                </button>
              )}
            </div>
            {/* Two clearly separate lines rather than one paragraph: "woher
                kommt der Bedarf" (this user's own data) and "welche Effekte"
                (what the product itself generally does) answer two different
                questions, and folding them into one sentence buried which was
                which. effects is optional (see SupplementRecommendation) —
                older stored runs simply don't have it, so that line just
                doesn't render rather than showing "undefined". */}
            <button type="button" onClick={() => setChatSuggestion(s)} className="flex flex-col gap-1 text-left">
              <p className="text-sm text-ink-soft">
                <span className="font-medium text-ink">Bedarf: </span>
                {s.reasoning}
              </p>
              {s.effects && (
                <p className="text-sm text-ink-soft">
                  <span className="font-medium text-ink">Wirkung: </span>
                  {s.effects}
                </p>
              )}
            </button>
            <p className="text-xs text-ink-soft">
              {s.suggestedDosage} · {s.suggestedTimesOfDay.map((t) => SUPPLEMENT_TIME_LABELS[t]).join(', ')}
            </p>
          </div>
        )
      })}
      </StaggeredList>

      <button
        type="button"
        onClick={handleRetry}
        disabled={retrying}
        className="self-center text-xs font-medium text-ink-soft underline-offset-2 hover:underline disabled:opacity-40"
      >
        {retrying ? 'Wird neu erstellt…' : 'Jetzt neu erstellen'}
      </button>

      {chatSuggestion && <SupplementChatSheet suggestion={chatSuggestion} onClose={() => setChatSuggestion(null)} />}
    </div>
  )
}

function formatRunDate(dateKey: string): string {
  const todayKey = toLocalDateKey(new Date())
  if (dateKey === todayKey) return 'heute'
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <circle cx="11" cy="11" r="7" />
      <path strokeLinecap="round" d="m20 20-3.5-3.5" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4">
      <path strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  )
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4">
      <path strokeLinecap="round" d="M5 12h14" />
    </svg>
  )
}
