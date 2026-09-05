import { useState } from 'react'
import {
  MICRONUTRIENT_LABELS,
  MICRONUTRIENT_ORDER,
  SUPPLEMENT_TIME_LABELS,
  toLocalDateKey,
  type MySupplement,
  type Supplement,
  type SupplementRecommendation,
} from '../lib/db'
import { getBodyProfile } from '../lib/bodyProfile'
import { useMicronutrientOverview } from '../hooks/useMicronutrients'
import { Sheet } from './Sheet'
import { SupplementChatSheet } from './SupplementChatSheet'
import { SupplementCategoryBadge } from './SupplementCategoryBadge'

const BAND_EXPLANATION: Record<'low' | 'average' | 'good' | 'surplus', (name: string) => string> = {
  low: (name) => `Dein ${name}-Spiegel liegt aktuell unter dem Referenzwert — hier deckt das Supp eine echte Lücke.`,
  average: (name) => `Dein ${name}-Spiegel liegt aktuell im durchschnittlichen Bereich.`,
  good: (name) => `Dein ${name}-Spiegel liegt aktuell gut im Referenzbereich.`,
  surplus: (name) => `Dein ${name}-Spiegel liegt aktuell deutlich über dem Referenzwert — ein Blick in die Empfehlungen kann sich lohnen.`,
}

type SupplementDetailSheetProps =
  | {
      mode: 'mine'
      mySupplement: MySupplement
      supplement: Supplement | undefined
      onClose: () => void
      onEdit: () => void
    }
  | {
      mode: 'recommendation'
      recommendation: SupplementRecommendation
      onClose: () => void
      onAdd: () => void
    }

/**
 * The shared detail sheet for a supplement — one layout (Dosierung, Bedarf,
 * Wirkung, KI-Chat) used from two different contexts, per explicit request
 * ("einheitliches Sheet-Design"):
 *
 * - `mode: 'mine'` — a routine entry from "Heute" (SupplementsPage's
 *   TodayTab). Action button is an edit icon, handing off to
 *   SupplementFormSheet the same way it always did.
 * - `mode: 'recommendation'` — a suggestion card from "Vorschläge"
 *   (SupplementsPage's SuggestionsTab). Action button is a plus icon that
 *   adds it to the list instead — there's nothing to edit yet. A
 *   `kind: 'consistency'`/`'no_longer_needed'` suggestion is already on the
 *   list, though, so it gets the same non-interactive "Schon auf der
 *   Liste"/"Nicht mehr notwendig" pill the card itself shows instead of a
 *   redundant add action. The card itself keeps its own inline content
 *   untouched ("Karte bleibt, Sheet zusätzlich" — this sheet is an
 *   additional, deeper view, not a replacement for what the card already
 *   shows at a glance).
 *
 * "Bedarf" means something different in each mode and is computed
 * accordingly rather than forced into one shape: for 'mine' it's a live,
 * personalized read of the micronutrient picture this exact entry
 * contributes to (see lib/micronutrients.ts) — not a cached snapshot, so it
 * never drifts from what MicronutrientBars shows elsewhere. For
 * 'recommendation' it's simply the advisor's own `reasoning` — already the
 * personalized "why you're seeing this now" text, computed once when the
 * suggestion was generated.
 *
 * The KI-Chat button is identical in both modes: SupplementChatSheet only
 * needs a SupplementRecommendation-shaped object to seed its opening
 * message, and a 'mine' entry's catalog description doubles as that "what/
 * why" context the same way a real recommendation's reasoning does.
 */
export function SupplementDetailSheet(props: SupplementDetailSheetProps) {
  const { onClose } = props
  const bodyProfile = getBodyProfile()
  const overview = useMicronutrientOverview(toLocalDateKey(new Date()))
  const [chatOpen, setChatOpen] = useState(false)

  const name = props.mode === 'mine' ? (props.supplement?.name ?? 'Supp') : props.recommendation.supplementName
  const category = props.mode === 'mine' ? props.supplement?.category : props.recommendation.category
  const description = props.mode === 'mine' ? props.supplement?.description : props.recommendation.effects
  const dosageLine =
    props.mode === 'mine'
      ? props.mySupplement.dosage
      : [props.recommendation.suggestedDosage, props.recommendation.suggestedTimesOfDay.map((t) => SUPPLEMENT_TIME_LABELS[t]).join(', ')]
          .filter(Boolean)
          .join(' · ')

  const chatSuggestion: SupplementRecommendation =
    props.mode === 'mine'
      ? {
          supplementName: name,
          category: props.supplement?.category ?? 'general_health',
          suggestedDosage: props.mySupplement.dosage,
          suggestedTimesOfDay: props.mySupplement.timesOfDay,
          reasoning: props.supplement?.description ?? '',
          kind: 'new',
        }
      : props.recommendation

  // Only 'mine' has a MySupplement.contribution to read a live per-nutrient
  // band from — a recommendation isn't on the list yet, so there's nothing
  // to compute a contribution against; its own `reasoning` already answers
  // "Bedarf" for that mode (see the component doc comment above).
  const contribution = props.mode === 'mine' ? props.mySupplement.contribution : undefined
  const relevantKeys = contribution ? MICRONUTRIENT_ORDER.filter((key) => (contribution[key] ?? 0) > 0) : []
  const statusByKey = new Map((overview?.statuses ?? []).map((s) => [s.key, s]))

  return (
    <Sheet onClose={onClose} sheetClassName="glass flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl">
      <div className="flex min-h-0 flex-col overflow-y-auto p-5 pt-7">
        <div className="mb-4 flex items-start gap-3">
          {category && <SupplementCategoryBadge category={category} className="h-10 w-10" />}
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold text-ink">{name}</h2>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              aria-label="KI Chat"
              title="KI Chat"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white transition hover:opacity-90 active:scale-95"
            >
              <ChatIcon />
            </button>
            {props.mode === 'mine' ? (
              <button
                type="button"
                onClick={props.onEdit}
                aria-label="Bearbeiten"
                title="Bearbeiten"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-bg text-ink-soft hover:bg-line"
              >
                <EditIcon />
              </button>
            ) : props.recommendation.kind === 'consistency' ? (
              // Already on the list — a marker, not an "add" action that would
              // only duplicate it. Icon rather than the card's old standing
              // text pill (see SupplementsPage.tsx's SuggestionsTab for the
              // full reasoning); the accessible name carries the wording.
              <span
                role="img"
                aria-label="Schon auf der Liste"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-section-12 text-sm font-bold text-section"
              >
                !
              </span>
            ) : props.recommendation.kind === 'no_longer_needed' ? (
              <span
                role="img"
                aria-label="Nicht mehr notwendig"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger/12 text-sm font-bold text-danger"
              >
                !
              </span>
            ) : (
              <button
                type="button"
                onClick={props.onAdd}
                aria-label="Zur Liste hinzufügen"
                title="Zur Liste hinzufügen"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/12 text-accent hover:bg-accent/20"
              >
                <PlusIcon />
              </button>
            )}
          </div>
        </div>

        {dosageLine && (
          <div className="mb-4">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Dosierung</h3>
            <p className="text-sm text-ink">{dosageLine}</p>
          </div>
        )}

        <div className="mb-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Bedarf</h3>
          {props.mode === 'recommendation' ? (
            <p className="text-sm leading-relaxed text-ink-soft">{props.recommendation.reasoning}</p>
          ) : !bodyProfile ? (
            <p className="text-sm text-ink-soft">
              Körperprofil in den Einstellungen einrichten, um deinen Bedarf einzuschätzen.
            </p>
          ) : overview === undefined ? (
            <p className="text-sm text-ink-soft">Lädt…</p>
          ) : !contribution ? (
            <p className="text-sm text-ink-soft">
              Wird noch ermittelt — sobald bekannt ist, wie viel dieses Supp zu deinen erfassten Mikronährstoffen
              beiträgt, erscheint hier eine Einschätzung.
            </p>
          ) : relevantKeys.length === 0 ? (
            <p className="text-sm text-ink-soft">
              Für dieses Supp gibt es keine direkte Bedarfsanzeige — es deckt keinen der zehn erfassten
              Mikronährstoffe ab.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {relevantKeys.map((key) => {
                const status = statusByKey.get(key)
                if (!status || status.band === null) {
                  return (
                    <p key={key} className="text-sm text-ink-soft">
                      {MICRONUTRIENT_LABELS[key]}: noch keine ausreichenden Daten.
                    </p>
                  )
                }
                return (
                  <p key={key} className="text-sm text-ink-soft">
                    {BAND_EXPLANATION[status.band](MICRONUTRIENT_LABELS[key])}
                  </p>
                )
              })}
            </div>
          )}
        </div>

        {description && (
          <div className="mb-4">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Wirkung</h3>
            <p className="text-sm leading-relaxed text-ink-soft">{description}</p>
          </div>
        )}
      </div>

      {chatOpen && <SupplementChatSheet suggestion={chatSuggestion} onClose={() => setChatOpen(false)} />}
    </Sheet>
  )
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M4 5h16v11H8l-4 4V5Z" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="h-4 w-4">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
