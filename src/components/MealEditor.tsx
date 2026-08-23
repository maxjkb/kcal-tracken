import { useState } from 'react'
import {
  MEAL_TYPE_LABELS,
  MEAL_TYPE_ORDER,
  newMealId,
  type Ingredient,
  type Meal,
  type MealType,
  type Nutrition,
} from '../lib/db'
import { saveMeal } from '../hooks/useMeals'
import { estimateNutrition, cleanUpDictation, GeminiError } from '../lib/gemini'
import { getApiKey } from '../lib/settings'
import { DictationButton } from './DictationButton'
import { PhotoInput } from './PhotoInput'
import { NutritionFields } from './NutritionFields'
import { AutoGrowTextarea } from './AutoGrowTextarea'
import { BouncingDots } from './BouncingDots'
import { Link } from 'react-router-dom'

const EMPTY_NUTRITION: Nutrition = { kcal: 0, protein: 0, carbs: 0, fat: 0 }

export function MealEditor({
  date,
  initial,
  defaultMealType,
  onClose,
}: {
  date: string
  initial?: Meal
  defaultMealType?: MealType
  onClose: () => void
}) {
  const [description, setDescription] = useState(initial?.description ?? '')
  const [photo, setPhoto] = useState<string | undefined>(initial?.photo)
  const [mealType, setMealType] = useState<MealType>(initial?.mealType ?? defaultMealType ?? 'lunch')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [nutrition, setNutrition] = useState<Nutrition>(initial?.nutrition ?? EMPTY_NUTRITION)
  const [ingredients, setIngredients] = useState<Ingredient[] | undefined>(initial?.ingredients)
  const [hasEstimate, setHasEstimate] = useState(Boolean(initial))
  const [estimating, setEstimating] = useState(false)
  const [cleaningUp, setCleaningUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<string | undefined>(initial?.note)
  const [manuallyEdited, setManuallyEdited] = useState(initial?.manuallyEdited ?? false)

  const hasApiKey = Boolean(getApiKey())

  async function handleDictationDone(rawText: string) {
    setCleaningUp(true)
    setError(null)
    try {
      const cleaned = await cleanUpDictation(rawText)
      setDescription((current) => (current.trim() ? `${current.trim()} ${cleaned}` : cleaned))
    } catch (err) {
      // Cleanup failing shouldn't lose the recording — fall back to the raw transcript.
      setDescription((current) => (current.trim() ? `${current.trim()} ${rawText}` : rawText))
      if (err instanceof GeminiError) setError(err.message)
    } finally {
      setCleaningUp(false)
    }
  }

  async function handleEstimate() {
    if (!description.trim() && !photo) {
      setError('Bitte beschreibe die Mahlzeit oder füge ein Foto hinzu.')
      return
    }
    setEstimating(true)
    setError(null)
    try {
      const result = await estimateNutrition({ description, photoDataUrl: photo })
      setTitle((current) => current || result.suggestedTitle)
      setNutrition({ kcal: result.kcal, protein: result.protein, carbs: result.carbs, fat: result.fat })
      setIngredients(result.ingredients)
      setNote(result.note)
      setManuallyEdited(false)
      setHasEstimate(true)
    } catch (err) {
      setError(err instanceof GeminiError ? err.message : 'Unbekannter Fehler bei der Schätzung.')
    } finally {
      setEstimating(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    const now = Date.now()
    const meal: Meal = {
      id: initial?.id ?? newMealId(),
      date,
      mealType,
      title: title.trim() || 'Mahlzeit',
      description,
      photo,
      nutrition,
      ingredients,
      note,
      manuallyEdited,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    }
    await saveMeal(meal)
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 backdrop-blur-sm sm:items-center">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">
            {initial ? 'Mahlzeit bearbeiten' : 'Mahlzeit hinzufügen'}
          </h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink" aria-label="Schließen">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <span className="mb-1 block text-xs text-ink-soft">Was hast du gegessen?</span>
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <AutoGrowTextarea
                  value={description}
                  onChange={setDescription}
                  disabled={cleaningUp}
                  placeholder="z.B. 200g Hähnchenbrust, 150g Reis, etwas Brokkoli und 1 EL Olivenöl"
                  className={`w-full rounded-2xl border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none ${cleaningUp ? 'opacity-50' : ''}`}
                />
                {cleaningUp && (
                  <p className="mt-1.5 flex items-center gap-2 text-xs text-ink-soft">
                    <BouncingDots /> Diktat wird bereinigt…
                  </p>
                )}
              </div>
              <DictationButton onRecordingDone={handleDictationDone} disabled={cleaningUp} />
            </div>
          </div>

          <PhotoInput photo={photo} onChange={setPhoto} />

          {!hasApiKey && (
            <p className="rounded-2xl bg-fat/15 px-3 py-2 text-xs text-ink">
              Kein API-Key hinterlegt.{' '}
              <Link to="/settings" onClick={onClose} className="font-semibold underline">
                Jetzt in den Einstellungen eintragen
              </Link>
              , um Nährwerte automatisch schätzen zu lassen.
            </p>
          )}

          <button
            type="button"
            onClick={handleEstimate}
            disabled={estimating || cleaningUp || !hasApiKey}
            className="glass-accent flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            {estimating ? <BouncingDots /> : hasEstimate ? 'Nährwerte neu schätzen' : 'Nährwerte schätzen'}
          </button>

          {error && <p className="text-sm font-medium text-danger">{error}</p>}
          {note && <p className="text-xs italic text-ink-soft">Hinweis der KI: {note}</p>}

          {hasEstimate && (
            <>
              <div>
                <span className="mb-1 block text-xs text-ink-soft">Mahlzeit</span>
                <div className="grid grid-cols-4 gap-1.5">
                  {MEAL_TYPE_ORDER.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setMealType(type)}
                      className={`rounded-xl px-2 py-2 text-xs font-medium transition ${
                        mealType === type ? 'bg-accent/20 text-ink' : 'bg-bg text-ink-soft hover:bg-line'
                      }`}
                    >
                      {MEAL_TYPE_LABELS[type]}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink-soft">Titel</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Titel des Gerichts"
                  className="rounded-2xl border border-line bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
                />
              </label>

              <div>
                <span className="mb-2 block text-xs text-ink-soft">
                  Nährwerte {manuallyEdited && <span className="font-semibold text-accent">(manuell angepasst)</span>}
                </span>
                <NutritionFields
                  value={nutrition}
                  onChange={(next) => {
                    setNutrition(next)
                    setManuallyEdited(true)
                  }}
                />
              </div>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="mt-2 rounded-2xl bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Speichern…' : 'Speichern'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
