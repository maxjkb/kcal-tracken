import { MICRONUTRIENT_LABELS, MICRONUTRIENT_ORDER, toLocalDateKey, type MySupplement, type Supplement } from '../lib/db'
import { getBodyProfile } from '../lib/bodyProfile'
import { useMicronutrientOverview } from '../hooks/useMicronutrients'
import { Sheet } from './Sheet'

const BAND_EXPLANATION: Record<'low' | 'average' | 'good' | 'surplus', (name: string) => string> = {
  low: (name) => `Dein ${name}-Spiegel liegt aktuell unter dem Referenzwert — hier deckt das Supplement eine echte Lücke.`,
  average: (name) => `Dein ${name}-Spiegel liegt aktuell im durchschnittlichen Bereich.`,
  good: (name) => `Dein ${name}-Spiegel liegt aktuell gut im Referenzbereich.`,
  surplus: (name) => `Dein ${name}-Spiegel liegt aktuell deutlich über dem Referenzwert — ein Blick in die Empfehlungen kann sich lohnen.`,
}

/**
 * Opened from a "Heute"-list row (see SupplementsPage's TodayTab) —
 * short description plus a live "wie sieht mein Bedarf gerade aus"
 * explanation, rather than jumping straight to the dosage/timing edit form
 * the way the row used to. Editing is still one tap away via `onEdit`,
 * which the caller handles by swapping this sheet for SupplementFormSheet
 * (same view→edit handoff MealDetail/MealEditor already use) rather than
 * stacking a second sheet on top of this one.
 *
 * The need indicator is deliberately NOT a cached, once-a-week snapshot —
 * it reads the same recency-weighted micronutrient picture (see
 * lib/micronutrients.ts) live, every time this opens, which already keeps
 * it current without a separate weekly-refresh mechanism to build and get
 * out of sync with the underlying data. Only shown for the micronutrients
 * this exact supplement actually contributes to (MySupplement.contribution,
 * see v1.16.2) — a supplement outside the ten tracked ones (Kreatin,
 * Omega-3, …) has nothing to show here, honestly, rather than a made-up
 * verdict about a nutrient it has no bearing on.
 */
export function SupplementDetailSheet({
  mySupplement,
  supplement,
  onClose,
  onEdit,
}: {
  mySupplement: MySupplement
  supplement: Supplement | undefined
  onClose: () => void
  onEdit: () => void
}) {
  const bodyProfile = getBodyProfile()
  const overview = useMicronutrientOverview(toLocalDateKey(new Date()))

  const contribution = mySupplement.contribution
  const relevantKeys = contribution ? MICRONUTRIENT_ORDER.filter((key) => (contribution[key] ?? 0) > 0) : []
  const statusByKey = new Map((overview?.statuses ?? []).map((s) => [s.key, s]))

  return (
    <Sheet onClose={onClose} sheetClassName="glass flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl">
      <div className="flex min-h-0 flex-col overflow-y-auto p-5 pt-7">
        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">{supplement?.name ?? 'Supplement'}</h2>
          <button
            type="button"
            onClick={onEdit}
            className="shrink-0 rounded-full bg-accent/12 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/20"
          >
            Bearbeiten
          </button>
        </div>
        {mySupplement.dosage && <p className="mb-4 text-xs text-ink-soft">{mySupplement.dosage}</p>}

        {supplement?.description && (
          <p className="mb-4 text-sm leading-relaxed text-ink-soft">{supplement.description}</p>
        )}

        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Dein aktueller Bedarf</h3>
        {!bodyProfile ? (
          <p className="text-sm text-ink-soft">
            Körperprofil in den Einstellungen einrichten, um deinen Bedarf einzuschätzen.
          </p>
        ) : overview === undefined ? (
          <p className="text-sm text-ink-soft">Lädt…</p>
        ) : !contribution ? (
          <p className="text-sm text-ink-soft">
            Wird noch ermittelt — sobald bekannt ist, wie viel dieses Supplement zu deinen erfassten Mikronährstoffen
            beiträgt, erscheint hier eine Einschätzung.
          </p>
        ) : relevantKeys.length === 0 ? (
          <p className="text-sm text-ink-soft">
            Für dieses Supplement gibt es keine direkte Bedarfsanzeige — es deckt keinen der zehn erfassten
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
    </Sheet>
  )
}
