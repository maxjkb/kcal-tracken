import { useState } from 'react'
import {
  MEAL_TYPE_LABELS,
  MEAL_TYPE_ORDER,
  newMealId,
  type Ingredient,
  type Meal,
  type MealType,
  type Nutrition,
  type Recipe,
} from '../lib/db'
import { saveMeal } from '../hooks/useMeals'
import { useAllRecipes } from '../hooks/useRecipes'
import { estimateNutrition, cleanUpDictation, GeminiError } from '../lib/gemini'
import { getApiKey } from '../lib/settings'
import { describeSaveError } from '../lib/errors'
import { DictationButton } from './DictationButton'
import { PhotoInput } from './PhotoInput'
import { NutritionFields } from './NutritionFields'
import { AutoGrowTextarea } from './AutoGrowTextarea'
import { BouncingDots } from './BouncingDots'
import { MacroBadge, MacroRingBadge } from './MacroBadge'
import { Link } from 'react-router-dom'
import { Sheet } from './Sheet'
import { useSheetClose } from '../hooks/useSheetClose'
import { useDraftAutosave, useRestoredDraft } from '../hooks/useFormDraft'
import { draftKey } from '../lib/drafts'
import { DraftRestoredBanner } from './DraftRestoredBanner'

const EMPTY_NUTRITION: Nutrition = { kcal: 0, protein: 0, carbs: 0, fat: 0 }

type Step = 'input' | 'review'

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/** Everything in this form worth carrying across an accidental close. */
interface MealDraft {
  step: Step
  hasResult: boolean
  mealDate: string
  description: string
  photo: string | undefined
  mealType: MealType
  title: string
  nutrition: Nutrition
  ingredients: Ingredient[] | undefined
  note: string | undefined
  manuallyEdited: boolean
}

/** Structural equality is enough here — every field is a plain JSON value, in a fixed key order. */
function isSameDraft(a: MealDraft, b: MealDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Fallback when the snapshot won't fit in storage: the photo is by far the largest field, and the one the user can re-pick in a tap. */
function stripPhoto(draft: MealDraft): MealDraft {
  return { ...draft, photo: undefined }
}

function sumIngredients(ingredients: Ingredient[]): Nutrition {
  return ingredients.reduce(
    (acc, i) => ({
      kcal: round1(acc.kcal + i.kcal),
      protein: round1(acc.protein + i.protein),
      carbs: round1(acc.carbs + i.carbs),
      fat: round1(acc.fat + i.fat),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )
}

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
  return (
    <Sheet
      onClose={onClose}
      sheetClassName="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-surface sm:rounded-3xl"
      closeOnBackdropClick={false}
    >
      <MealEditorContent date={date} initial={initial} defaultMealType={defaultMealType} />
    </Sheet>
  )
}

/** Disables backdrop-click (unlike the read-only MealDetail/pickers): this form holds real
  * typed input, so an accidental outside tap shouldn't be able to discard it. Drag-to-dismiss
  * stays on — it only ever fires from a deliberate pull on the dedicated handle, never from a
  * stray touch, so it doesn't carry that same accidental-loss risk. */
function MealEditorContent({
  date,
  initial,
  defaultMealType,
}: {
  date: string
  initial?: Meal
  defaultMealType?: MealType
}) {
  const requestClose = useSheetClose()

  // The form's whole restorable state in one object, so the baseline (what the
  // sheet opened with) and the current values can be compared wholesale to
  // decide whether there's anything worth rescuing. Comparing against the
  // baseline rather than against "empty" is what makes this work for editing an
  // existing meal too: reopening one and changing nothing leaves no draft.
  const baseline: MealDraft = {
    step: initial ? 'review' : 'input',
    hasResult: Boolean(initial),
    mealDate: initial?.date ?? date,
    description: initial?.description ?? '',
    photo: initial?.photo,
    mealType: initial?.mealType ?? defaultMealType ?? 'lunch',
    title: initial?.title ?? '',
    nutrition: initial?.nutrition ?? EMPTY_NUTRITION,
    ingredients: initial?.ingredients,
    note: initial?.note,
    manuallyEdited: initial?.manuallyEdited ?? false,
  }

  const draftId = draftKey('meal', initial?.id)
  const restored = useRestoredDraft<MealDraft>(draftId)
  const [restoredNotice, setRestoredNotice] = useState(Boolean(restored))

  const [step, setStep] = useState<Step>(restored?.step ?? baseline.step)
  const [hasResult, setHasResult] = useState(restored?.hasResult ?? baseline.hasResult)
  const [mealDate, setMealDate] = useState(restored?.mealDate ?? baseline.mealDate)
  const [description, setDescription] = useState(restored?.description ?? baseline.description)
  const [photo, setPhoto] = useState<string | undefined>(restored ? restored.photo : baseline.photo)
  const [mealType, setMealType] = useState<MealType>(restored?.mealType ?? baseline.mealType)
  const [title, setTitle] = useState(restored?.title ?? baseline.title)
  const [nutrition, setNutrition] = useState<Nutrition>(restored?.nutrition ?? baseline.nutrition)
  const [ingredients, setIngredients] = useState<Ingredient[] | undefined>(
    restored ? restored.ingredients : baseline.ingredients,
  )
  const [estimating, setEstimating] = useState(false)
  const [cleaningUp, setCleaningUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<string | undefined>(restored ? restored.note : baseline.note)
  const [manuallyEdited, setManuallyEdited] = useState(restored?.manuallyEdited ?? baseline.manuallyEdited)
  const [pickingRecipe, setPickingRecipe] = useState(false)

  const snapshot: MealDraft = {
    step,
    hasResult,
    mealDate,
    description,
    photo,
    mealType,
    title,
    nutrition,
    ingredients,
    note,
    manuallyEdited,
  }
  const draft = useDraftAutosave(draftId, snapshot, !isSameDraft(snapshot, baseline), stripPhoto)

  /** Drops the restored values and returns the sheet to how it opened. */
  function discardDraft() {
    setStep(baseline.step)
    setHasResult(baseline.hasResult)
    setMealDate(baseline.mealDate)
    setDescription(baseline.description)
    setPhoto(baseline.photo)
    setMealType(baseline.mealType)
    setTitle(baseline.title)
    setNutrition(baseline.nutrition)
    setIngredients(baseline.ingredients)
    setNote(baseline.note)
    setManuallyEdited(baseline.manuallyEdited)
    setRestoredNotice(false)
    draft.clear()
  }

  const hasApiKey = Boolean(getApiKey())
  const recipes = useAllRecipes()

  function handleSelectRecipe(recipe: Recipe) {
    setTitle(recipe.title)
    setNutrition(recipe.nutrition)
    setIngredients(recipe.ingredients)
    setNote(undefined)
    setManuallyEdited(false)
    setHasResult(true)
    setPickingRecipe(false)
    setStep('review')
  }

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
      setHasResult(true)
      setStep('review')
    } catch (err) {
      setError(err instanceof GeminiError ? err.message : 'Unbekannter Fehler bei der Schätzung.')
    } finally {
      setEstimating(false)
    }
  }

  function handleIngredientAmountChange(index: number, newAmount: number) {
    setIngredients((current) => {
      if (!current) return current
      const ing = current[index]
      const ratio = ing.amount > 0 && newAmount >= 0 ? newAmount / ing.amount : 1
      const scaled: Ingredient = {
        ...ing,
        amount: newAmount,
        kcal: round1(ing.kcal * ratio),
        protein: round1(ing.protein * ratio),
        carbs: round1(ing.carbs * ratio),
        fat: round1(ing.fat * ratio),
      }
      const next = current.map((item, i) => (i === index ? scaled : item))
      setNutrition(sumIngredients(next))
      setManuallyEdited(true)
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const now = Date.now()
    const meal: Meal = {
      id: initial?.id ?? newMealId(),
      date: mealDate,
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
    try {
      await saveMeal(meal)
      draft.clear()
      requestClose()
    } catch (err) {
      // Without this, a failed write (full storage, a browser/IndexedDB
      // hiccup, …) left the editor stuck on a disabled "Speichern…" button
      // with no explanation — the meal silently never made it into the feed.
      setError(describeSaveError(err, 'Mahlzeit'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="flex shrink-0 items-center justify-between p-5 pb-4 pt-7">
        {step === 'review' ? (
          <button onClick={() => setStep('input')} className="text-ink-soft hover:text-ink" aria-label="Zurück">
            <BackIcon />
          </button>
        ) : (
          <h2 className="text-lg font-semibold text-ink">{initial ? 'Mahlzeit bearbeiten' : 'Mahlzeit hinzufügen'}</h2>
        )}
        <div className="flex items-center gap-3">
          {step === 'input' && hasResult && (
            <button
              onClick={() => setStep('review')}
              className="text-ink-soft hover:text-ink"
              aria-label="Weiter zu den Nährwerten"
            >
              <ForwardIcon />
            </button>
          )}
        </div>
      </div>

      {restoredNotice && (
        <div className="shrink-0 px-5">
          <DraftRestoredBanner onDiscard={discardDraft} />
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          className="flex w-full shrink-0 transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${step === 'review' ? 100 : 0}%)` }}
        >
          {/* Step 1: input */}
          <div className="w-full shrink-0 overflow-y-auto px-5 pb-5">
            {pickingRecipe ? (
              <div className="flex flex-col gap-4">
                <button
                  type="button"
                  onClick={() => setPickingRecipe(false)}
                  className="self-start text-xs font-medium text-ink-soft hover:text-ink"
                >
                  ← Zurück zur Beschreibung
                </button>
                {recipes === undefined ? (
                  <p className="py-6 text-center text-sm text-ink-soft">Lädt…</p>
                ) : recipes.length === 0 ? (
                  <p className="py-6 text-center text-sm text-ink-soft">
                    Noch keine Rezepte gespeichert. Unter „Rezepte" in der Navigation anlegen.
                  </p>
                ) : (
                  MEAL_TYPE_ORDER.map((type) => {
                    const typeRecipes = recipes.filter((r) => r.category === type)
                    if (typeRecipes.length === 0) return null
                    return (
                      <div key={type}>
                        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
                          {MEAL_TYPE_LABELS[type]}
                        </span>
                        <div className="flex flex-col gap-1.5">
                          {typeRecipes.map((r) => (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => handleSelectRecipe(r)}
                              className="rounded-2xl border border-line px-3 py-2.5 text-left hover:bg-bg"
                            >
                              <span className="block text-sm font-medium text-ink">{r.title}</span>
                              <span className="text-xs text-ink-soft">{Math.round(r.nutrition.kcal)} kcal</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            ) : (
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
                    <Link to="/settings" onClick={requestClose} className="font-semibold underline">
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
                  {estimating ? <BouncingDots /> : 'Nährwerte schätzen'}
                </button>

                <button
                  type="button"
                  onClick={() => setPickingRecipe(true)}
                  className="rounded-2xl bg-bg px-4 py-2.5 text-sm font-medium text-ink-soft transition hover:bg-line"
                >
                  Rezept auswählen
                </button>

                {error && <p className="text-sm font-medium text-danger">{error}</p>}
              </div>
            )}
          </div>

          {/* Step 2: review */}
          <div className="w-full shrink-0 overflow-y-auto px-5 pb-5">
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink-soft">Datum</span>
                <input
                  type="date"
                  value={mealDate}
                  onChange={(e) => e.target.value && setMealDate(e.target.value)}
                  className="rounded-2xl border border-line bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
                />
              </label>

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

              {ingredients && ingredients.length > 0 && (
                <div>
                  <span className="mb-2 block text-xs text-ink-soft">Zutaten</span>
                  <div className="flex flex-col gap-2">
                    {ingredients.map((ing, i) => (
                      <div key={i} className="rounded-2xl border border-line p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-ink">{ing.name}</span>
                          <div className="flex shrink-0 items-center gap-1">
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              value={ing.amount}
                              onChange={(e) => handleIngredientAmountChange(i, Number(e.target.value) || 0)}
                              className="w-16 rounded-lg border border-line bg-bg px-1.5 py-1 text-right text-xs text-ink focus:border-accent focus:outline-none"
                            />
                            <span className="text-xs text-ink-soft">{ing.unit}</span>
                          </div>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <MacroBadge type="kcal" value={ing.kcal} size="sm" />
                          <MacroRingBadge type="protein" value={ing.protein} size="sm" />
                          <MacroRingBadge type="carbs" value={ing.carbs} size="sm" />
                          <MacroRingBadge type="fat" value={ing.fat} size="sm" />
                        </div>
                        {ing.note && <p className="mt-1.5 text-xs italic text-ink-soft">{ing.note}</p>}
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-ink-faint">
                    Menge ändern skaliert die Nährwerte dieser Zutat automatisch (keine neue Schätzung).
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="glass-accent mt-2 flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? 'Speichern…' : 'Speichern'}
              </button>

              {error && <p className="text-sm font-medium text-danger">{error}</p>}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}

function ForwardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}
