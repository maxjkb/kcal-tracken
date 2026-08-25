import { useState } from 'react'
import {
  SUPPLEMENT_CATEGORY_LABELS,
  SUPPLEMENT_TIME_LABELS,
  SUPPLEMENT_TIME_ORDER,
  type MySupplement,
  type Supplement,
  type SupplementCategory,
  type SupplementTimeOfDay,
} from '../lib/db'
import { SUPPLEMENT_CATEGORY_ORDER } from '../lib/supplementSeed'
import {
  addMySupplement,
  newCustomSupplement,
  removeMySupplement,
  saveSupplement,
  updateMySupplement,
} from '../hooks/useSupplements'
import { estimateSupplementTiming, GeminiError } from '../lib/gemini'
import { getApiKey } from '../lib/settings'
import { describeSaveError } from '../lib/errors'
import { Sheet } from './Sheet'
import { useSheetClose } from '../hooks/useSheetClose'
import { useDraftAutosave, useRestoredDraft } from '../hooks/useFormDraft'
import { draftKey } from '../lib/drafts'
import { DraftRestoredBanner } from './DraftRestoredBanner'
import { BouncingDots } from './BouncingDots'

/**
 * One form, three uses:
 * - Adding an existing catalog entry to "Meine Liste" (`supplement` set).
 * - Adding a brand-new custom supplement not yet in the catalog (neither
 *   prop set — name/category/dosage become editable instead of fixed).
 * - Editing (or removing) an entry already on the list (`editing` set).
 */
export function SupplementFormSheet({
  supplement,
  editing,
  onClose,
}: {
  supplement?: Supplement
  editing?: { mySupplement: MySupplement; supplement: Supplement | undefined }
  onClose: () => void
}) {
  return (
    <Sheet onClose={onClose} sheetClassName="glass flex w-full max-w-lg flex-col rounded-t-3xl p-5 pt-7 sm:rounded-3xl">
      <SupplementFormContent supplement={supplement ?? editing?.supplement} editing={editing} />
    </Sheet>
  )
}

/** Everything in this form worth carrying across an accidental close. */
interface SupplementDraft {
  name: string
  category: SupplementCategory
  dosage: string
  timesOfDay: SupplementTimeOfDay[]
}

function isSameSupplementDraft(a: SupplementDraft, b: SupplementDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function SupplementFormContent({
  supplement,
  editing,
}: {
  supplement?: Supplement
  editing?: { mySupplement: MySupplement; supplement: Supplement | undefined }
}) {
  const requestClose = useSheetClose()
  const isCustomEntry = !supplement && !editing
  const hasApiKey = Boolean(getApiKey())

  const baseline: SupplementDraft = {
    name: supplement?.name ?? '',
    category: supplement?.category ?? 'general_health',
    dosage: editing?.mySupplement.dosage ?? supplement?.typicalDosage ?? '',
    timesOfDay: editing?.mySupplement.timesOfDay ?? ['morning'],
  }

  // Keyed by the list entry being edited, or one shared "new" slot — there can
  // only ever be one unsaved new supplement in flight at a time.
  const draftId = draftKey('supplement', editing?.mySupplement.id ?? supplement?.id)
  const restored = useRestoredDraft<SupplementDraft>(draftId)
  const [restoredNotice, setRestoredNotice] = useState(Boolean(restored))

  const [name, setName] = useState(restored?.name ?? baseline.name)
  const [category, setCategory] = useState<SupplementCategory>(restored?.category ?? baseline.category)
  const [dosage, setDosage] = useState(restored?.dosage ?? baseline.dosage)
  const [timesOfDay, setTimesOfDay] = useState<SupplementTimeOfDay[]>(restored?.timesOfDay ?? baseline.timesOfDay)
  const [suggestingTime, setSuggestingTime] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const snapshot: SupplementDraft = { name, category, dosage, timesOfDay }
  const draft = useDraftAutosave(draftId, snapshot, !isSameSupplementDraft(snapshot, baseline))

  /** Drops the restored values and returns the sheet to how it opened. */
  function discardDraft() {
    setName(baseline.name)
    setCategory(baseline.category)
    setDosage(baseline.dosage)
    setTimesOfDay(baseline.timesOfDay)
    setRestoredNotice(false)
    draft.discard()
  }

  function toggleTime(t: SupplementTimeOfDay) {
    setTimesOfDay((current) =>
      current.includes(t) ? current.filter((x) => x !== t) : [...current, t].sort((a, b) => SUPPLEMENT_TIME_ORDER.indexOf(a) - SUPPLEMENT_TIME_ORDER.indexOf(b)),
    )
  }

  async function handleSuggestTime() {
    if (!name.trim()) {
      setError('Bitte zuerst einen Namen eingeben.')
      return
    }
    setSuggestingTime(true)
    setError(null)
    try {
      const suggested = await estimateSupplementTiming(name)
      setTimesOfDay(suggested)
    } catch (err) {
      setError(err instanceof GeminiError ? err.message : 'Unbekannter Fehler bei der Zeitpunkt-Empfehlung.')
    } finally {
      setSuggestingTime(false)
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('Bitte einen Namen eingeben.')
      return
    }
    if (timesOfDay.length === 0) {
      setError('Bitte mindestens eine Tageszeit wählen.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (editing) {
        await updateMySupplement({ ...editing.mySupplement, dosage: dosage.trim(), timesOfDay })
      } else {
        let catalogEntry = supplement
        if (!catalogEntry) {
          catalogEntry = newCustomSupplement({ name: name.trim(), category, description: '', typicalDosage: dosage.trim() })
          await saveSupplement(catalogEntry)
        }
        await addMySupplement({ supplementId: catalogEntry.id, dosage: dosage.trim(), timesOfDay })
      }
      draft.clear()
      requestClose()
    } catch (err) {
      setError(describeSaveError(err, 'Supplement'))
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    if (!editing) return
    setSaving(true)
    setError(null)
    try {
      await removeMySupplement(editing.mySupplement.id)
      draft.clear()
      requestClose()
    } catch (err) {
      // The one handler here that had a finally but no catch: a failed write
      // re-enabled the button and said nothing, so the entry looked removable
      // but never went away.
      setError(describeSaveError(err, 'Supplement'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-ink">
          {editing ? 'Supplement bearbeiten' : isCustomEntry ? 'Eigenes Supplement' : 'Zur Liste hinzufügen'}
        </h2>
      </div>

      {restoredNotice && <DraftRestoredBanner onDiscard={discardDraft} />}

      <div className="flex flex-col gap-4">
        {isCustomEntry ? (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-soft">Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. L-Theanin"
                className="rounded-2xl border border-line bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
              />
            </label>
            <div>
              <span className="mb-1 block text-xs text-ink-soft">Kategorie</span>
              <div className="grid grid-cols-3 gap-1.5">
                {SUPPLEMENT_CATEGORY_ORDER.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`rounded-xl px-2 py-3.5 text-xs font-medium transition ${
                      category === c ? 'bg-accent/20 text-ink' : 'bg-bg text-ink-soft hover:bg-line'
                    }`}
                  >
                    {SUPPLEMENT_CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div>
            <p className="text-base font-semibold text-ink">{name}</p>
            <p className="text-xs text-ink-soft">{SUPPLEMENT_CATEGORY_LABELS[category]}</p>
          </div>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink-soft">Dosierung</span>
          <input
            type="text"
            value={dosage}
            onChange={(e) => setDosage(e.target.value)}
            placeholder="z.B. 3–5 g täglich"
            className="rounded-2xl border border-line bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
          />
        </label>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs text-ink-soft">Wann nimmst du das?</span>
            <button
              type="button"
              onClick={handleSuggestTime}
              disabled={suggestingTime || !hasApiKey}
              className="flex items-center gap-1 text-xs font-medium text-accent disabled:cursor-not-allowed disabled:opacity-40"
              title={hasApiKey ? undefined : 'Kein API-Key hinterlegt'}
            >
              {suggestingTime ? <BouncingDots /> : '✨ KI-Vorschlag'}
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {SUPPLEMENT_TIME_ORDER.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTime(t)}
                className={`rounded-xl px-2 py-3.5 text-xs font-medium transition ${
                  timesOfDay.includes(t) ? 'bg-accent/20 text-ink' : 'bg-bg text-ink-soft hover:bg-line'
                }`}
              >
                {SUPPLEMENT_TIME_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm font-medium text-danger">{error}</p>}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="glass-accent mt-1 flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Speichern…' : editing ? 'Speichern' : 'Hinzufügen'}
        </button>

        {editing && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={saving}
            className="rounded-2xl bg-bg px-4 py-2.5 text-sm font-medium text-danger transition hover:bg-line disabled:opacity-50"
          >
            Von der Liste entfernen
          </button>
        )}
      </div>
    </>
  )
}
