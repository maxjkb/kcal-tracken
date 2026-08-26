import { useState } from 'react'
import {
  MEAL_TYPE_LABELS,
  MEAL_TYPE_ORDER,
  newMealId,
  type Ingredient,
  type Meal,
  type MealType,
  type Micronutrients,
  type Nutrition,
  type Recipe,
} from '../lib/db'
import { saveMeal } from '../hooks/useMeals'
import { useAllRecipes } from '../hooks/useRecipes'
import { useMealSuggestions } from '../hooks/useMeals'
import type { MealSuggestion } from '../lib/mealSuggestions'
import { estimateNutrition, cleanUpDictation, GeminiError } from '../lib/gemini'
import { getApiKey } from '../lib/settings'
import { describeSaveError } from '../lib/errors'
import { DictationButton } from './DictationButton'
import { PhotoActionButton, PhotoPreview } from './PhotoInput'
import { ActionButton } from './ActionButton'
import { NutritionFields } from './NutritionFields'
import { NumberField } from './NumberField'
import { AutoGrowTextarea } from './AutoGrowTextarea'
import { ChevronIcon } from './ChevronIcon'
import { StaggeredList } from './StaggeredList'
import { BouncingDots } from './BouncingDots'
import { MacroChips } from './MacroChips'
import { Link } from 'react-router-dom'
import { Sheet } from './Sheet'
import { useSheetClose } from '../hooks/useSheetClose'
import { useSwipeBack } from '../hooks/useSwipeBack'
import { useIngredientScaling } from '../hooks/useIngredientScaling'
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
  micronutrients: Micronutrients | undefined
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
      // Opens part-way: the title, the field and the actions are what matter on
      // arrival, while the suggestions below are there to be pulled up, not to
      // bury the page the moment the sheet appears.
      detents={[0.6, 1]}
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
    micronutrients: initial?.micronutrients,
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
  // Estimated once per AI pass, at meal level (see MICRONUTRIENT_SCHEMA in
  // lib/gemini.ts) — never rescaled when an ingredient amount is nudged
  // afterward, the same tradeoff db.ts already documents for `ingredients`
  // itself: it reflects the estimate at the time it ran, not necessarily in
  // sync with later manual tweaks. Not worth solving here — there is no
  // per-ingredient micronutrient breakdown to rescale from, and these only
  // ever feed a rolling weekly band, not an exact daily number.
  const [micronutrients, setMicronutrients] = useState<Micronutrients | undefined>(
    restored ? restored.micronutrients : baseline.micronutrients,
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
    micronutrients,
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
    setMicronutrients(baseline.micronutrients)
    setNote(baseline.note)
    setManuallyEdited(baseline.manuallyEdited)
    setRestoredNotice(false)
    draft.discard()
  }

  // Swiping right does what the back control on this step does. Null while
  // there is nothing to go back to, so the gesture stays inert on step one.
  const swipeBack = useSwipeBack(pickingRecipe ? () => setPickingRecipe(false) : step === 'review' ? () => setStep('input') : null)

  const scaleIngredient = useIngredientScaling()

  const hasApiKey = Boolean(getApiKey())
  const recipes = useAllRecipes()

  function handleSelectRecipe(recipe: Recipe) {
    setTitle(recipe.title)
    setNutrition(recipe.nutrition)
    setIngredients(recipe.ingredients)
    // Recipes saved before micronutrient estimation existed carry none —
    // stays undefined rather than a fake all-zero value, same reasoning as
    // Meal.micronutrients itself (see db.ts): "never estimated" and
    // "estimated as roughly zero" are different facts, and only the first
    // is true here.
    setMicronutrients(recipe.micronutrients)
    setNote(undefined)
    setManuallyEdited(false)
    setHasResult(true)
    setPickingRecipe(false)
    setStep('review')
  }

  function handleSelectSuggestion(suggestion: MealSuggestion) {
    setTitle(suggestion.title)
    setNutrition(suggestion.nutrition)
    setIngredients(suggestion.ingredients)
    setMicronutrients(suggestion.micronutrients)
    setNote(undefined)
    setManuallyEdited(false)
    setHasResult(true)
    setStep('review')
  }

  // Same routine meal, but not quite today's version of it — "the usual, plus
  // a banana" — so this stays on step one with the description filled in
  // rather than jumping to numbers that no longer match what's about to be
  // eaten. Re-running the estimate (not just editing the old numbers by hand)
  // is the point: the text is what changed, so the text should drive it.
  function handleEditSuggestion(suggestion: MealSuggestion) {
    setTitle(suggestion.title)
    setDescription(suggestion.description)
    setHasResult(false)
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
      setMicronutrients(result.micronutrients)
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
    // Computed from the current value rather than inside a setIngredients
    // updater: the updater also has to set the totals and the edited flag, and
    // an updater that calls other setState functions is impure — StrictMode
    // double-invokes it, so those side effects ran twice per keystroke.
    if (!ingredients) return
    const next = scaleIngredient(ingredients, index, newAmount)
    setIngredients(next)
    setNutrition(sumIngredients(next))
    setManuallyEdited(true)
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
      micronutrients,
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

      <div className="flex min-h-0 flex-1 overflow-hidden" {...swipeBack}>
        <div
          className="flex w-full shrink-0 transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${step === 'review' ? 100 : 0}%)` }}
        >
          {/* Step 1: input */}
          <div className="w-full shrink-0 overflow-y-auto overflow-x-hidden px-5 pb-5">
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
                        // Two 44px buttons and the 8px gap between them: the
                        // field now starts level with the mic and ends level
                        // with the send arrow instead of stopping short of it.
                        minHeight={96}
                        placeholder="z.B. 200g Hähnchenbrust, 150g Reis, etwas Brokkoli und 1 EL Olivenöl"
                        className={`w-full rounded-2xl border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none ${cleaningUp ? 'opacity-50' : ''}`}
                      />
                      {cleaningUp && (
                        <p className="mt-1.5 flex items-center gap-2 text-xs text-ink-soft">
                          <BouncingDots /> Diktat wird bereinigt…
                        </p>
                      )}
                    </div>
                    {/* Dictate and send stack beside the field, in the order
                        they're used: speak the meal, then send it. Both act on
                        the text, so they belong next to it rather than in the
                        row of input *sources* below — grouping by proximity is
                        what tells you which control affects what. */}
                    <div className="flex shrink-0 flex-col gap-2">
                      <DictationButton onRecordingDone={handleDictationDone} disabled={cleaningUp} />
                      <ActionButton
                        label="Nährwerte schätzen"
                        onClick={handleEstimate}
                        disabled={estimating || cleaningUp || !hasApiKey}
                        primary
                      >
                        {estimating ? <BouncingDots /> : <SendIcon />}
                      </ActionButton>
                    </div>
                  </div>
                </div>

                {/* The three ways to fill the field, as equal round options
                    rather than full-width slabs: a saved recipe, a new photo,
                    or one already in the library. Tinted, not solid — the one
                    primary action is the send arrow above. */}
                <div className="flex items-center gap-3">
                  <ActionButton label="Rezept auswählen" onClick={() => setPickingRecipe(true)}>
                    <RecipeIcon />
                  </ActionButton>
                  <PhotoActionButton photo={photo} onChange={setPhoto} source="camera" />
                  <PhotoActionButton photo={photo} onChange={setPhoto} source="library" />
                </div>

                {photo && <PhotoPreview photo={photo} onChange={setPhoto} />}

                {!hasApiKey && (
                  <p className="rounded-2xl bg-fat/15 px-3 py-2 text-xs text-ink">
                    Kein API-Key hinterlegt.{' '}
                    <Link to="/settings" onClick={requestClose} className="font-semibold underline">
                      Jetzt in den Einstellungen eintragen
                    </Link>
                    , um Nährwerte automatisch schätzen zu lassen.
                  </p>
                )}

                {error && <p className="text-sm font-medium text-danger">{error}</p>}

                <MealSuggestions mealType={mealType} onPick={handleSelectSuggestion} onEdit={handleEditSuggestion} />
              </div>
            )}
          </div>

          {/* Step 2: review */}
          <div className="w-full shrink-0 overflow-y-auto overflow-x-hidden px-5 pb-5">
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
                      className={`rounded-xl px-2 py-3.5 text-xs font-medium transition ${
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
                            <NumberField
                              value={ing.amount}
                              onChange={(next: number) => handleIngredientAmountChange(i, next)}
                              ariaLabel={`Menge für ${ing.name}`}
                              className="w-16 rounded-lg border border-line bg-bg px-1.5 py-1 text-right text-xs text-ink focus:border-accent focus:outline-none"
                            />
                            <span className="text-xs text-ink-soft">{ing.unit}</span>
                          </div>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <MacroChips kcal={ing.kcal} protein={ing.protein} carbs={ing.carbs} fat={ing.fat} size="sm" />
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
                className="glass-accent mt-2 flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}

function ForwardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}

/**
 * One-tap starting points, below the actions.
 *
 * Ranked by what tends to be logged at this time of day, what's logged often,
 * and what was logged recently (see lib/mealSuggestions.ts). Picking one skips
 * straight to the review step: it's a meal that already has its numbers, so
 * there is nothing left to estimate. The pencil is the escape hatch for "the
 * usual, but not quite" — it drops the description back into step one instead,
 * so it can be amended and re-estimated rather than reusing stale numbers.
 *
 * Renders nothing at all until there's history worth offering — an empty
 * "Vorschläge" heading on a fresh install would be a promise the app can't
 * keep yet.
 */
function MealSuggestions({
  mealType,
  onPick,
  onEdit,
}: {
  mealType: MealType
  onPick: (s: MealSuggestion) => void
  onEdit: (s: MealSuggestion) => void
}) {
  const suggestions = useMealSuggestions(mealType, 6)
  if (!suggestions || suggestions.length === 0) return null

  return (
    <div>
      <span className="mb-1.5 block text-xs text-ink-soft">Vorschläge</span>
      <StaggeredList className="flex flex-col gap-1.5">
        {suggestions.map((s) => (
          <div key={s.title} className="flex items-center gap-1 rounded-2xl border border-line pr-1.5">
            <button
              type="button"
              onClick={() => onPick(s)}
              className="flex min-w-0 flex-1 items-center justify-between gap-3 py-2.5 pl-3 text-left transition active:opacity-70"
            >
              {/* `flex-1` alongside `min-w-0` is what actually lets this
                  shrink. With min-w-0 alone the column still sized to its
                  content, so a long meal title pushed the row wider than the
                  sheet — and since the step pane scrolls, the whole sheet
                  could be dragged sideways. */}
              <span className="min-w-0 flex-1">
                {/* Two lines, then ellipsis: one line cut most real titles off
                    mid-dish, and these are picked by reading them. */}
                <span className="block text-sm font-medium leading-snug text-ink line-clamp-2">{s.title}</span>
                {/* The same badges the Feed uses, so a meal looks the same
                    wherever it appears — recognising it here is the whole
                    point of the list. */}
                <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <MacroChips kcal={s.nutrition.kcal} protein={s.nutrition.protein} carbs={s.nutrition.carbs} fat={s.nutrition.fat} size="sm" />
                </span>
              </span>
              <span className="shrink-0 text-ink-faint">
                <ChevronIcon direction="right" className="h-4 w-4" />
              </span>
            </button>
            <button
              type="button"
              onClick={() => onEdit(s)}
              aria-label={`„${s.title}" bearbeiten statt direkt übernehmen`}
              title="Vor dem Übernehmen bearbeiten"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-faint transition active:scale-95 active:bg-bg hover:text-ink"
            >
              <EditIcon />
            </button>
          </div>
        ))}
      </StaggeredList>
    </div>
  )
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 4.5l3 3L7 20H4v-3L16.5 4.5z"
      />
    </svg>
  )
}

function RecipeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6.5c-1.5-1.3-3.6-2-6-2v13c2.4 0 4.5.7 6 2m0-13c1.5-1.3 3.6-2 6-2v13c-2.4 0-4.5.7-6 2m0-13v13"
      />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h13m0 0-5-5m5 5-5 5" />
    </svg>
  )
}
