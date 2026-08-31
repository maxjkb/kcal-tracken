import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import {
  SUPPLEMENT_CATEGORY_LABELS,
  SUPPLEMENT_TIME_LABELS,
  toLocalDateKey,
  type MySupplement,
  type SupplementRecommendation,
} from '../lib/db'
import { PageHeader } from '../components/PageHeader'
import { StaggeredList } from '../components/StaggeredList'
import {
  addSuggestionToMyList,
  useAllSupplements,
  useLatestAdvisorRun,
  useMySupplement,
  useMySupplements,
  useSupplementLogForDate,
} from '../hooks/useSupplements'
import { generateAdvisorRun } from '../lib/supplementAdvisor'
import { GeminiError } from '../lib/gemini'
import { getApiKey } from '../lib/settings'
import { SupplementChecklistRow } from '../components/SupplementChecklist'
import { SupplementFormSheet } from '../components/SupplementFormSheet'
import { SupplementDetailSheet } from '../components/SupplementDetailSheet'
import { SupplementCatalogSheet } from '../components/SupplementCatalogSheet'
import { SuppScoreSheet } from '../components/SuppScoreSheet'
import { SupplementCategoryBadge } from '../components/SupplementCategoryBadge'
import { InfoButton } from '../components/InfoButton'
import { HeaderButton } from '../components/PageHeader'
import { SPRING_SNAPPY } from '../lib/motionTokens'
import { GlassSurface } from '../glass/GlassSurface'

type Tab = 'today' | 'suggestions'
const TABS: { key: Tab; label: string }[] = [
  { key: 'today', label: 'Heute' },
  { key: 'suggestions', label: 'Vorschläge' },
]

export function SupplementsPage() {
  const [tab, setTab] = useState<Tab>('today')
  // Katalog used to be a third tab here — now a sheet, reached from the
  // header like Einstellungen/+ already are. It doesn't belong to either
  // "Heute" or "Vorschläge": browsing/adding from the catalog is an action
  // you take *from* those views, not a view of its own you'd sit in.
  const [catalogOpen, setCatalogOpen] = useState(false)
  // Same reasoning as the Katalog button below: the Supp-Score used to be
  // its own routed page, reached only via the Statistik card. A trophy
  // button right beside Katalog gets there directly from Supplements too,
  // without a detour through Statistik.
  const [scoreOpen, setScoreOpen] = useState(false)
  const prefersReducedMotion = useReducedMotion()

  return (
    <div className="mx-auto max-w-lg px-4 pb-28">
      <PageHeader
        title="Supplements"
        actions={
          <>
            <HeaderButton onClick={() => setScoreOpen(true)} label="Supp-Score">
              <TrophyIcon />
            </HeaderButton>
            <HeaderButton onClick={() => setCatalogOpen(true)} label="Katalog">
              <CatalogIcon />
            </HeaderButton>
          </>
        }
      />

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
      {tab === 'suggestions' && <SuggestionsTab />}

      {/* Was a permanently-visible paragraph — now behind an "i" like every
          other disclaimer in the app, per explicit request. */}
      <div className="mt-8 flex justify-center">
        <InfoButton label="Hinweis zu den Supplement-Vorschlägen" title="Hinweis">
          Diese Vorschläge basieren auf deinen geloggten Daten und allgemein bekannten Zusammenhängen — sie sind
          keine medizinische Beratung. Bei Vorerkrankungen, Medikamenten oder Schwangerschaft vorher ärztlich
          abklären.
        </InfoButton>
      </div>

      {catalogOpen && <SupplementCatalogSheet onClose={() => setCatalogOpen(false)} />}
      {scoreOpen && <SuppScoreSheet onClose={() => setScoreOpen(false)} />}
    </div>
  )
}

function CatalogIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-[1.15rem] w-[1.15rem]">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" />
      <path strokeLinecap="round" d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" />
    </svg>
  )
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-[1.15rem] w-[1.15rem]">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
      <path strokeLinecap="round" d="M8 5H5a3 3 0 0 0 3 4M16 5h3a3 3 0 0 1-3 4M12 12v3M9 19h6M10 19v-2.5a2 2 0 0 1 4 0V19" />
    </svg>
  )
}

function EmptyStateIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
      <g transform="rotate(-30 12 12)">
        <rect x="3" y="8" width="18" height="8" rx="4" />
        <line x1="12" y1="8" x2="12" y2="16" />
      </g>
    </svg>
  )
}

function TodayTab() {
  const todayKey = toLocalDateKey(new Date())
  const mySupplements = useMySupplements()
  const supplements = useAllSupplements()
  const logEntries = useSupplementLogForDate(todayKey)
  // Tapping a row now opens the detail sheet (description + current need)
  // first, not the edit form directly — the edit form is reached from a
  // button inside that sheet (see SupplementDetailSheet's onEdit), the same
  // view→edit handoff MealDetail/MealEditor already use, one state swap
  // rather than two sheets stacked on top of each other.
  //
  // A single discriminated-union state (not two independent booleans/values)
  // so "closing" the edit form has somewhere correct to go back to: it was
  // reached from the view sheet, so its own Sheet onClose (swipe-down,
  // handle tap, or a completed save — all funnel through the same callback)
  // returns to 'view', not all the way to 'closed'. Two separate `viewing`/
  // `editing` states previously couldn't express that — closing the edit
  // form just cleared `editing` while `viewing` stayed null from the earlier
  // handoff, closing the whole flow instead of returning to the view.
  const [state, setState] = useState<
    { mode: 'closed' } | { mode: 'view'; mySupplement: MySupplement } | { mode: 'edit'; mySupplement: MySupplement }
  >({ mode: 'closed' })
  // Live, not just `state.mySupplement` itself: after the edit form hands
  // back to 'view', that value is still the pre-edit snapshot — this re-reads
  // the just-saved dosage/times. Falls back to the snapshot while the query
  // is still resolving, so there's no loading flash.
  const viewedMySupplement = useMySupplement(state.mode === 'view' ? state.mySupplement.id : undefined)

  const supplementById = new Map((supplements ?? []).map((s) => [s.id, s]))

  return (
    <div className="flex flex-col gap-2.5">
      {mySupplements === undefined || logEntries === undefined ? (
        <p className="py-10 text-center text-sm text-ink-soft">Lädt…</p>
      ) : mySupplements.length === 0 ? (
        <GlassSurface rim={26} className="glass-subtle glass-subtle-themed flex flex-col items-center gap-3 rounded-3xl px-6 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/12 text-accent">
            <EmptyStateIcon />
          </span>
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
            onOpen={() => setState({ mode: 'view', mySupplement: my })}
          />
        ))
      )}

      {state.mode === 'view' && (
        <SupplementDetailSheet
          mode="mine"
          mySupplement={viewedMySupplement ?? state.mySupplement}
          supplement={supplementById.get(state.mySupplement.supplementId)}
          onClose={() => setState({ mode: 'closed' })}
          onEdit={() => setState({ mode: 'edit', mySupplement: state.mySupplement })}
        />
      )}

      {state.mode === 'edit' && (
        <SupplementFormSheet
          editing={{ mySupplement: state.mySupplement, supplement: supplementById.get(state.mySupplement.supplementId) }}
          // Back to 'view', not 'closed': see the state comment above. Except
          // when the entry was actually removed — then there's nothing left
          // to view, so onRemoved closes the flow all the way out instead.
          onClose={() => setState({ mode: 'view', mySupplement: state.mySupplement })}
          onRemoved={() => setState({ mode: 'closed' })}
        />
      )}
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
  // Opens the same unified detail sheet "Meine Liste" rows use (Dosierung/
  // Wirkung/Bedarf + a KI-Chat button inside) — additional to the card, not
  // a replacement for it: the card's own inline reasoning/effects text and
  // its quick-add "+" stay exactly as they were, per explicit request
  // ("Karte bleibt, Sheet zusätzlich"). Tapping the card's name/reasoning
  // area used to jump straight to the chat; it opens this richer sheet
  // instead now, with the chat one tap further in — the same two-step depth
  // "Meine Liste" already uses, so both flows now behave identically.
  const [viewing, setViewing] = useState<SupplementRecommendation | null>(null)

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
              {/* Opens the detail sheet — not the whole card: the +/pill control on
                  the same row needs to stay its own, sibling tap target (a
                  <button> can't legally nest another one), same constraint
                  CatalogTab's rows already solve. */}
              <button
                type="button"
                onClick={() => setViewing(s)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                aria-label={`Details zu ${s.supplementName} öffnen`}
              >
                <SupplementCategoryBadge category={s.category} className="h-9 w-9" />
                <span className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{s.supplementName}</p>
                  <p className="text-xs text-ink-soft">{SUPPLEMENT_CATEGORY_LABELS[s.category]}</p>
                </span>
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
            <button type="button" onClick={() => setViewing(s)} className="flex flex-col gap-1 text-left">
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

      {viewing && (
        <SupplementDetailSheet
          mode="recommendation"
          recommendation={viewing}
          onClose={() => setViewing(null)}
          onAdd={() => {
            void handleAdd(viewing)
            setViewing(null)
          }}
        />
      )}
    </div>
  )
}

function formatRunDate(dateKey: string): string {
  const todayKey = toLocalDateKey(new Date())
  if (dateKey === todayKey) return 'heute'
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4">
      <path strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  )
}
