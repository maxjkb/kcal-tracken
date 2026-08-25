import { useState } from 'react'
import {
  MEAL_TYPE_LABELS,
  MEAL_TYPE_ORDER,
  newRecipeId,
  type Ingredient,
  type Meal,
  type MealType,
  type Nutrition,
  type Recipe,
  type RecipeStep,
} from '../lib/db'
import { saveRecipe } from '../hooks/useRecipes'
import { estimateRecipe, estimateSingleIngredient, cleanUpDictation, GeminiError } from '../lib/gemini'
import { getApiKey } from '../lib/settings'
import { describeSaveError } from '../lib/errors'
import { DictationButton } from './DictationButton'
import { NutritionFields } from './NutritionFields'
import { AutoGrowTextarea } from './AutoGrowTextarea'
import { BouncingDots } from './BouncingDots'
import { MacroBadge, MacroRingBadge } from './MacroBadge'
import { Link } from 'react-router-dom'
import { Sheet } from './Sheet'
import { useSheetClose } from '../hooks/useSheetClose'
import { useSwipeBack } from '../hooks/useSwipeBack'
import { useDraftAutosave, useRestoredDraft } from '../hooks/useFormDraft'
import { draftKey } from '../lib/drafts'
import { DraftRestoredBanner } from './DraftRestoredBanner'

const EMPTY_NUTRITION: Nutrition = { kcal: 0, protein: 0, carbs: 0, fat: 0 }

type Step = 'input' | 'review'

function round1(value: number): number {
  return Math.round(value * 10) / 10
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

/** A recipe idea to seed the editor with — from an AI suggestion, not yet structured, so it
  * opens on the input step with `description` prefilled, ready for the user to hit "Rezept
  * schätzen" themselves (this app's one trusted path from free text to real nutrition numbers). */
export interface RecipeSeed {
  title: string
  description: string
  category: MealType
}

export function RecipeEditor({
  category,
  initial,
  fromMeal,
  seed,
  onClose,
}: {
  /** Preselects the category — set when opened from a specific Rezepte category page. */
  category: MealType
  initial?: Recipe
  /** Starts a NEW recipe pre-filled from an already-logged meal's real data (title/description/
    * ingredients/nutrition) — opens straight on the review step, same as editing, but always
    * saves as a new recipe (no `id`/`createdAt` carried over). */
  fromMeal?: Meal
  /** Starts a NEW recipe from an AI-suggested idea — opens on the input step so "Rezept
    * schätzen" can turn the seed description into real structured data. */
  seed?: RecipeSeed
  onClose: () => void
}) {
  return (
    <Sheet
      onClose={onClose}
      sheetClassName="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-surface sm:rounded-3xl"
      closeOnBackdropClick={false}
    >
      <RecipeEditorContent category={category} initial={initial} fromMeal={fromMeal} seed={seed} />
    </Sheet>
  )
}

/** Disables backdrop-click (unlike the read-only MealDetail/pickers): this form holds real
  * typed input, so an accidental outside tap shouldn't be able to discard it. Drag-to-dismiss
  * stays on — it only ever fires from a deliberate pull on the dedicated handle, never from a
  * stray touch, so it doesn't carry that same accidental-loss risk. */
/** Everything in this form worth carrying across an accidental close. */
interface RecipeDraft {
  step: Step
  hasResult: boolean
  description: string
  recipeCategory: MealType
  title: string
  nutrition: Nutrition
  ingredients: Ingredient[]
  steps: RecipeStep[]
  manuallyEdited: boolean
}

/** Structural equality is enough — every field is a plain JSON value, in a fixed key order. */
function isSameRecipeDraft(a: RecipeDraft, b: RecipeDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function RecipeEditorContent({
  category,
  initial,
  fromMeal,
  seed,
}: {
  category: MealType
  initial?: Recipe
  fromMeal?: Meal
  seed?: RecipeSeed
}) {
  const requestClose = useSheetClose()

  // What the sheet opened with — the yardstick for "is there anything worth
  // rescuing here". Comparing against this rather than against an empty form
  // is what makes the draft work when editing an existing recipe too:
  // reopening one and changing nothing leaves no draft behind.
  const baseline: RecipeDraft = {
    step: initial || fromMeal ? 'review' : 'input',
    hasResult: Boolean(initial || fromMeal),
    description: initial?.description ?? fromMeal?.description ?? seed?.description ?? '',
    recipeCategory: initial?.category ?? fromMeal?.mealType ?? seed?.category ?? category,
    title: initial?.title ?? fromMeal?.title ?? seed?.title ?? '',
    nutrition: initial?.nutrition ?? fromMeal?.nutrition ?? EMPTY_NUTRITION,
    ingredients: initial?.ingredients ?? fromMeal?.ingredients ?? [],
    steps: initial?.steps ?? [],
    manuallyEdited: initial?.manuallyEdited ?? Boolean(fromMeal),
  }

  const draftId = draftKey('recipe', initial?.id)
  const restored = useRestoredDraft<RecipeDraft>(draftId)
  const [restoredNotice, setRestoredNotice] = useState(Boolean(restored))

  const [step, setStep] = useState<Step>(restored?.step ?? baseline.step)
  const [hasResult, setHasResult] = useState(restored?.hasResult ?? baseline.hasResult)
  const [description, setDescription] = useState(restored?.description ?? baseline.description)
  const [recipeCategory, setRecipeCategory] = useState<MealType>(restored?.recipeCategory ?? baseline.recipeCategory)
  const [title, setTitle] = useState(restored?.title ?? baseline.title)
  const [nutrition, setNutrition] = useState<Nutrition>(restored?.nutrition ?? baseline.nutrition)
  const [ingredients, setIngredients] = useState<Ingredient[]>(restored?.ingredients ?? baseline.ingredients)
  const [steps, setSteps] = useState<RecipeStep[]>(restored?.steps ?? baseline.steps)
  const [estimating, setEstimating] = useState(false)
  const [cleaningUp, setCleaningUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [manuallyEdited, setManuallyEdited] = useState(restored?.manuallyEdited ?? baseline.manuallyEdited)

  const [addingIngredient, setAddingIngredient] = useState(false)
  const [newIngredientText, setNewIngredientText] = useState('')
  const [estimatingIngredient, setEstimatingIngredient] = useState(false)
  const [ingredientError, setIngredientError] = useState<string | null>(null)

  const snapshot: RecipeDraft = {
    step,
    hasResult,
    description,
    recipeCategory,
    title,
    nutrition,
    ingredients,
    steps,
    manuallyEdited,
  }
  const draft = useDraftAutosave(draftId, snapshot, !isSameRecipeDraft(snapshot, baseline))

  /** Drops the restored values and returns the sheet to how it opened. */
  function discardDraft() {
    setStep(baseline.step)
    setHasResult(baseline.hasResult)
    setDescription(baseline.description)
    setRecipeCategory(baseline.recipeCategory)
    setTitle(baseline.title)
    setNutrition(baseline.nutrition)
    setIngredients(baseline.ingredients)
    setSteps(baseline.steps)
    setManuallyEdited(baseline.manuallyEdited)
    setRestoredNotice(false)
    draft.clear()
  }

  // Swiping right does what the back control on this step does. Null while
  // there is nothing to go back to, so the gesture stays inert on step one.
  const swipeBack = useSwipeBack(step === 'review' ? () => setStep('input') : null)

  const hasApiKey = Boolean(getApiKey())

  async function handleDictationDone(rawText: string) {
    setCleaningUp(true)
    setError(null)
    try {
      const cleaned = await cleanUpDictation(rawText)
      setDescription((current) => (current.trim() ? `${current.trim()} ${cleaned}` : cleaned))
    } catch (err) {
      setDescription((current) => (current.trim() ? `${current.trim()} ${rawText}` : rawText))
      if (err instanceof GeminiError) setError(err.message)
    } finally {
      setCleaningUp(false)
    }
  }

  async function handleEstimate() {
    if (!description.trim()) {
      setError('Bitte beschreibe das Rezept.')
      return
    }
    setEstimating(true)
    setError(null)
    try {
      const result = await estimateRecipe(description)
      setTitle((current) => current || result.suggestedTitle)
      setNutrition({ kcal: result.kcal, protein: result.protein, carbs: result.carbs, fat: result.fat })
      setIngredients(result.ingredients)
      setSteps(result.steps.map((text, i) => ({ order: i, text })))
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

  function handleRemoveIngredient(index: number) {
    setIngredients((current) => {
      const next = current.filter((_, i) => i !== index)
      setNutrition(sumIngredients(next))
      setManuallyEdited(true)
      return next
    })
  }

  async function handleAddIngredient() {
    if (!newIngredientText.trim()) return
    setEstimatingIngredient(true)
    setIngredientError(null)
    try {
      const result = await estimateSingleIngredient(newIngredientText)
      setIngredients((current) => {
        const next = [...current, result]
        setNutrition(sumIngredients(next))
        return next
      })
      setManuallyEdited(true)
      setNewIngredientText('')
      setAddingIngredient(false)
    } catch (err) {
      setIngredientError(err instanceof GeminiError ? err.message : 'Unbekannter Fehler bei der Schätzung.')
    } finally {
      setEstimatingIngredient(false)
    }
  }

  function handleStepTextChange(index: number, text: string) {
    setSteps((current) => current.map((s, i) => (i === index ? { ...s, text } : s)))
  }

  function handleRemoveStep(index: number) {
    setSteps((current) => current.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i })))
  }

  function handleAddStep() {
    setSteps((current) => [...current, { order: current.length, text: '' }])
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const now = Date.now()
    const recipe: Recipe = {
      id: initial?.id ?? newRecipeId(),
      category: recipeCategory,
      title: title.trim() || 'Rezept',
      description,
      ingredients,
      steps: steps.filter((s) => s.text.trim().length > 0).map((s, i) => ({ order: i, text: s.text.trim() })),
      nutrition,
      manuallyEdited,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    }
    try {
      await saveRecipe(recipe)
      draft.clear()
      requestClose()
    } catch (err) {
      setError(describeSaveError(err, 'Rezept'))
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
          <h2 className="text-lg font-semibold text-ink">
            {initial ? 'Rezept bearbeiten' : fromMeal ? 'Rezept aus Mahlzeit' : 'Rezept hinzufügen'}
          </h2>
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
          {/* Step 1: input — same idea as the meal editor, minus the photo. */}
          <div className="w-full shrink-0 overflow-y-auto px-5 pb-5">
            <div className="flex flex-col gap-4">
              <div>
                <span className="mb-1 block text-xs text-ink-soft">Rezept beschreiben</span>
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <AutoGrowTextarea
                      value={description}
                      onChange={setDescription}
                      disabled={cleaningUp}
                      placeholder="z.B. 300g Nudeln, 100g Hackfleisch, 250ml Fix-Tomatensauce, 100g passierte Tomaten. Zuerst Nudeln kochen, Hackfleisch anbraten, Sauce dazugeben und köcheln lassen."
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

              {!hasApiKey && (
                <p className="rounded-2xl bg-fat/15 px-3 py-2 text-xs text-ink">
                  Kein API-Key hinterlegt.{' '}
                  <Link to="/settings" onClick={requestClose} className="font-semibold underline">
                    Jetzt in den Einstellungen eintragen
                  </Link>
                  , um Zutaten und Zubereitung automatisch schätzen/strukturieren zu lassen.
                </p>
              )}

              <button
                type="button"
                onClick={handleEstimate}
                disabled={estimating || cleaningUp || !hasApiKey}
                className="glass-accent flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
              >
                {estimating ? <BouncingDots /> : 'Rezept schätzen'}
              </button>

              {error && <p className="text-sm font-medium text-danger">{error}</p>}
            </div>
          </div>

          {/* Step 2: review */}
          <div className="w-full shrink-0 overflow-y-auto px-5 pb-5">
            <div className="flex flex-col gap-4">
              <div>
                <span className="mb-1 block text-xs text-ink-soft">Kategorie</span>
                <div className="grid grid-cols-4 gap-1.5">
                  {MEAL_TYPE_ORDER.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setRecipeCategory(type)}
                      className={`rounded-xl px-2 py-2 text-xs font-medium transition ${
                        recipeCategory === type ? 'bg-accent/20 text-ink' : 'bg-bg text-ink-soft hover:bg-line'
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
                  placeholder="Titel des Rezepts"
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

              <div>
                <span className="mb-2 block text-xs text-ink-soft">Zutaten</span>
                {ingredients.length > 0 && (
                  <div className="mb-2 flex flex-col gap-2">
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
                            <button
                              type="button"
                              onClick={() => handleRemoveIngredient(i)}
                              aria-label={`${ing.name} entfernen`}
                              className="ml-1 text-ink-faint hover:text-danger"
                            >
                              <TrashIcon />
                            </button>
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
                )}

                {addingIngredient ? (
                  <div className="rounded-2xl border border-dashed border-line p-3">
                    <input
                      type="text"
                      value={newIngredientText}
                      onChange={(e) => setNewIngredientText(e.target.value)}
                      placeholder="z.B. 150g Feta"
                      disabled={estimatingIngredient}
                      className="w-full rounded-xl border border-line bg-bg px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none disabled:opacity-50"
                    />
                    <div className="mt-2 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleAddIngredient}
                        disabled={estimatingIngredient || !newIngredientText.trim()}
                        className="glass-accent flex flex-1 items-center justify-center rounded-xl py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {estimatingIngredient ? <BouncingDots /> : 'Schätzen'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAddingIngredient(false)
                          setNewIngredientText('')
                          setIngredientError(null)
                        }}
                        disabled={estimatingIngredient}
                        className="shrink-0 text-xs text-ink-soft hover:text-ink"
                      >
                        Abbrechen
                      </button>
                    </div>
                    {ingredientError && <p className="mt-1.5 text-xs font-medium text-danger">{ingredientError}</p>}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingIngredient(true)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line py-2.5 text-xs font-medium text-ink-soft hover:bg-bg"
                  >
                    <PlusIcon /> Zutat
                  </button>
                )}
                <p className="mt-2 text-xs text-ink-faint">
                  Menge ändern skaliert die Nährwerte der Zutat automatisch. Über „Zutat +" fügst du eine weitere
                  Zutat hinzu — die KI schätzt deren Nährwerte anhand des eingegebenen Textes.
                </p>
              </div>

              <div>
                <span className="mb-2 block text-xs text-ink-soft">Zubereitung</span>
                <div className="flex flex-col gap-2">
                  {steps.map((s, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-2 shrink-0 text-xs font-semibold text-ink-faint">{i + 1}.</span>
                      <AutoGrowTextarea
                        value={s.text}
                        onChange={(text) => handleStepTextChange(i, text)}
                        placeholder="Zubereitungsschritt"
                        className="flex-1 rounded-2xl border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveStep(i)}
                        aria-label={`Schritt ${i + 1} entfernen`}
                        className="mt-2 shrink-0 text-ink-faint hover:text-danger"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={handleAddStep}
                    className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line py-2.5 text-xs font-medium text-ink-soft hover:bg-bg"
                  >
                    <PlusIcon /> Schritt
                  </button>
                </div>
              </div>

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

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-3.5 w-3.5">
      <path strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <path strokeLinecap="round" d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 .8 12.2A2 2 0 0 0 8.8 21h6.4a2 2 0 0 0 2-1.8L18 7" />
    </svg>
  )
}
