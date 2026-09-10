import { useState } from 'react'
import { Sheet } from './Sheet'
import { GeminiError } from '../lib/gemini'
import { requestIllnessTargetAdjustment, saveSickDayDetails, toggleSickDay, useSickDay } from '../lib/illness'
import type { SickDay } from '../lib/db'

const CATEGORY_LABELS: Record<NonNullable<SickDay['category']>, string> = {
  erkaeltung: 'Erkältung',
  grippe: 'Grippe',
  magen_darm: 'Magen-Darm',
  sonstiges: 'Sonstiges',
}
const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as NonNullable<SickDay['category']>[]

/**
 * Detail entry point for one sick day — opened by SickDayButton's long-press
 * (or its first-ever activation for a day). Lets the category/note be set,
 * and separately lets the user request the on-request AI target suggestion
 * (see estimateIllnessTargets) — computing it is never automatic, it only
 * ever runs when this Sheet's own button is pressed.
 */
export function SickDaySheet({ dateKey, onClose }: { dateKey: string; onClose: () => void }) {
  const sickDay = useSickDay(dateKey)
  const [category, setCategory] = useState<SickDay['category']>(undefined)
  const [note, setNote] = useState('')
  const [initialized, setInitialized] = useState(false)
  const [computing, setComputing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Seed local form state from the live row the first time it resolves —
  // not a controlled read straight from sickDay, so typing in the note field
  // isn't fighting the live query re-emitting on every keystroke's own save.
  if (!initialized && sickDay !== undefined) {
    setCategory(sickDay?.category)
    setNote(sickDay?.note ?? '')
    setInitialized(true)
  }

  async function persist(nextCategory: SickDay['category'], nextNote: string) {
    if (!sickDay) await toggleSickDay(dateKey) // long-press on an unmarked day still marks it once details are entered
    await saveSickDayDetails(dateKey, { category: nextCategory, note: nextNote })
  }

  async function handleAdjust() {
    setComputing(true)
    setError(null)
    try {
      await persist(category, note)
      await requestIllnessTargetAdjustment(dateKey)
    } catch (err) {
      setError(err instanceof GeminiError ? err.message : 'Die Anpassung konnte nicht berechnet werden.')
    } finally {
      setComputing(false)
    }
  }

  async function handleRemove() {
    await toggleSickDay(dateKey) // row exists whenever this button is shown, so this always turns it off
    onClose()
  }

  const override = sickDay?.targetOverride

  return (
    <Sheet onClose={onClose} sheetClassName="glass flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl">
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-5 pt-7">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Krank</h2>
          <p className="text-xs text-ink-soft">Für diesen Tag markiert — Art und Notiz sind optional.</p>
        </div>

        <div>
          <span className="mb-1.5 block text-xs text-ink-soft">Art</span>
          <div className="grid grid-cols-4 gap-1.5">
            {CATEGORY_ORDER.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  const next = category === key ? undefined : key
                  setCategory(next)
                  void persist(next, note)
                }}
                className={`rounded-xl px-2 py-3 text-xs font-medium transition ${
                  category === key ? 'bg-danger/15 text-danger' : 'bg-bg text-ink-soft hover:bg-line'
                }`}
              >
                {CATEGORY_LABELS[key]}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink-soft">Symptome / Notiz</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => void persist(category, note)}
            placeholder="z.B. Halsschmerzen, leichtes Fieber…"
            rows={2}
            className="field resize-none rounded-2xl px-3 py-2 text-sm"
          />
        </label>

        <div className="glass-subtle glass-subtle-themed rounded-2xl p-4">
          <p className="mb-2 text-sm font-medium text-ink">Nährwerte anpassen</p>
          <p className="mb-3 text-xs text-ink-soft">
            Berechnet auf Wunsch ein für heute passenderes Ziel — auf Basis der aktuellen Forschungslage und deiner eigenen
            Ernährungsgewohnheiten der letzten Wochen. Wird nie automatisch verändert.
          </p>

          {override ? (
            <div className="mb-3 flex flex-col gap-2">
              <div className="grid grid-cols-4 gap-1.5 text-center">
                <Stat label="kcal" value={Math.round(override.kcal)} />
                <Stat label="Protein" value={`${Math.round(override.protein)}g`} />
                <Stat label="Kohlenh." value={`${Math.round(override.carbs)}g`} />
                <Stat label="Fett" value={`${Math.round(override.fat)}g`} />
              </div>
              <p className="text-xs text-ink-soft">{override.reasoning}</p>
            </div>
          ) : null}

          {error && <p className="mb-2 text-xs font-medium text-danger">{error}</p>}

          <button
            type="button"
            onClick={handleAdjust}
            disabled={computing}
            className="glass-accent w-full rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {computing ? 'Berechnet…' : override ? 'Neu berechnen' : 'Jetzt berechnen'}
          </button>
        </div>

        {sickDay && (
          <button type="button" onClick={handleRemove} className="text-sm font-medium text-danger">
            Als krank entfernen
          </button>
        )}
      </div>
    </Sheet>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-bg px-1 py-2">
      <div className="text-sm font-semibold text-ink">{value}</div>
      <div className="text-[0.65rem] text-ink-soft">{label}</div>
    </div>
  )
}
