import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  db,
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
import { findUnconfirmedSupplementMatches, type SupplementMatch } from '../lib/supplementTextMatch'
import { mealTypeToSupplementTimeOfDay } from '../lib/mealTypeGuess'
import { addMySupplement, toggleSupplementCheck } from '../hooks/useSupplements'
import { lookupFoodByBarcode } from '../lib/foodDatabase'
import { DictationButton } from './DictationButton'
import { PhotoActionButton, PhotoPreview } from './PhotoInput'
import { ActionButton } from './ActionButton'
import { NutritionFields } from './NutritionFields'
import { NumberField } from './NumberField'
import { AutoGrowTextarea } from './AutoGrowTextarea'
import { ChevronIcon } from './ChevronIcon'
import { StaggeredList } from './StaggeredList'
import { BouncingDots } from './BouncingDots'
import { MacroBadge, MacroRingBadge } from './MacroBadge'
import { Link } from 'react-router-dom'
import { Sheet } from './Sheet'
import { useSheetClose } from '../hooks/useSheetClose'
import { useSwipeBack } from '../hooks/useSwipeBack'
import { useIngredientScaling } from '../hooks/useIngredientScaling'
import { useDraftAutosave, useRestoredDraft } from '../hooks/useFormDraft'
import { draftKey } from '../lib/drafts'
import { DraftRestoredBanner } from './DraftRestoredBanner'
import { InfoButton } from './InfoButton'

const EMPTY_NUTRITION: Nutrition = { kcal: 0, protein: 0, carbs: 0, fat: 0 }

/** BarcodeScanner's own component type, without a runtime import — the module (and @zxing with it) is loaded on demand, see openBarcodeScanner below. */
type BarcodeScannerType = typeof import('./BarcodeScanner').BarcodeScanner

type Step = 'input' | 'review'

/**
 * Fallback for step 1's collapsed height, used for the very first paint
 * before the input row has been measured — one line plus its padding.
 * After that the real, measured height takes over (see `inputRowRef`),
 * because the row grows as the field wraps and a fixed height would clip
 * the field's own top off once it did.
 */
const INPUT_ROW_FALLBACK_HEIGHT = 92

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
      // Single detent (the default) now that the "open compact, reveal more
      // by pulling up" job lives inside step 1 itself (INPUT_STEP_COLLAPSED_HEIGHT
      // + the sticky description field below) rather than in the sheet's own
      // partial-open mechanism: this sheet's natural height while on step 1 is
      // already just the compact pane, so a second, sheet-level partial detent
      // on top of that would clip even shorter than intended and fight the
      // pane's own scroll-driven reveal instead of complementing it.
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
  // ever feed a recency-weighted band, not an exact daily number.
  const [micronutrients, setMicronutrients] = useState<Micronutrients | undefined>(
    restored ? restored.micronutrients : baseline.micronutrients,
  )
  const [estimating, setEstimating] = useState(false)
  // Simulated, not measured: a single generateContent call has no partial-
  // progress signal to report (see handleEstimate below), so this is a
  // timer-driven ease toward ~92% while waiting, jumping to 100% only once
  // the real response actually lands — informative without claiming to
  // measure something that isn't actually observable here.
  const [estimateProgress, setEstimateProgress] = useState(0)
  // Whether the description field currently needs more than its one starting
  // line — drives where the dictation button lives (inside the field vs.
  // under the send button). Measured by the field itself, since wrapping
  // depends on its rendered width, not on the text alone.
  const [descriptionWrapped, setDescriptionWrapped] = useState(false)
  // The collapsed pane is exactly as tall as the docked input row, measured
  // rather than hard-coded: the row grows when the description wraps, and a
  // fixed height clipped the top of the field off as soon as it did.
  const inputRowRef = useRef<HTMLDivElement>(null)
  const [inputRowHeight, setInputRowHeight] = useState(INPUT_ROW_FALLBACK_HEIGHT)
  const estimateProgressTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    return () => {
      if (estimateProgressTimer.current) clearInterval(estimateProgressTimer.current)
    }
  }, [])
  const [cleaningUp, setCleaningUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<string | undefined>(restored ? restored.note : baseline.note)
  const [manuallyEdited, setManuallyEdited] = useState(restored?.manuallyEdited ?? baseline.manuallyEdited)
  const [pickingRecipe, setPickingRecipe] = useState(false)
  // Set right after a successful save if the description mentions a
  // supplement not yet checked off today — non-null switches the whole sheet
  // over to the confirmation panel below instead of closing immediately.
  const [matchedSupplements, setMatchedSupplements] = useState<SupplementMatch[] | null>(null)
  const [confirmedSupplementIds, setConfirmedSupplementIds] = useState<Set<string>>(new Set())
  const [barcodeStep, setBarcodeStep] = useState<'idle' | 'scanning' | 'looking-up' | 'not-found'>('idle')
  const [barcodeLoadError, setBarcodeLoadError] = useState<string | null>(null)
  // Loaded on demand rather than imported at the top of this file: pulling
  // in @zxing/library (a barcode-decoding engine, ~250kB) for every meal
  // edit — the vast majority of which never touch the scanner — bloated
  // the app's single largest chunk by more than 2x. A plain dynamic
  // import(), not lazyRetry: lazyRetry's whole recovery move is a forced
  // page reload, which is the right call for a stale route chunk but would
  // throw away this open sheet's in-progress meal to recover a scanner
  // button the user can simply tap again — same reasoning as the PDF
  // export's dynamic import elsewhere in this codebase.
  const [BarcodeScannerComp, setBarcodeScannerComp] = useState<BarcodeScannerType | null>(null)

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

  // Step 1's collapsed-height pane (below) always opens scrolled to its own
  // bottom, so the description field — the last thing in that pane's DOM —
  // is what's actually on screen first, with the recipe/photo/barcode row,
  // any photo preview, hints and suggestions starting scrolled out of view
  // above it. `stickToBottomRef` keeps it pinned there as that content
  // arrives (a photo attached, suggestions loading in) — but only until the
  // user actually scrolls themselves, the same "stay pinned unless the user
  // took over" rule a chat view uses for new messages.
  const step1ScrollRef = useRef<HTMLDivElement>(null)
  const step1ContentRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  useLayoutEffect(() => {
    const scrollNode = step1ScrollRef.current
    const contentNode = step1ContentRef.current
    if (!scrollNode || !contentNode) return
    // Scrolled to bottom immediately on mount — and the observer is on the
    // CONTENT node, not the (fixed-height) scroll container itself: the
    // container's own box never changes size, so only watching its content
    // catches a later-arriving photo preview or suggestion list actually
    // growing the scrollable area.
    scrollNode.scrollTop = scrollNode.scrollHeight
    const observer = new ResizeObserver(() => {
      if (stickToBottomRef.current) scrollNode.scrollTop = scrollNode.scrollHeight
    })
    observer.observe(contentNode)
    return () => observer.disconnect()
  }, [])
  useLayoutEffect(() => {
    const node = inputRowRef.current
    if (!node) return
    const sync = () => setInputRowHeight(node.getBoundingClientRect().height)
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(node)
    return () => observer.disconnect()
  }, [step, pickingRecipe])

  // Re-pin to the bottom whenever the input row's height changes —
  // unconditionally, unlike the content-driven effect above, which only
  // re-pins while the user hasn't scrolled away. Two reasons it can't defer
  // to that flag here: the flag was already false in the collapsed state
  // (the pane sits a few pixels short of its own maximum, so the
  // "am I at the bottom" test never passed), and a row that grows because
  // the user is typing in it has to stay fully visible regardless — the
  // field's own top edge was otherwise pushed above the pane and clipped.
  useLayoutEffect(() => {
    const pane = step1ScrollRef.current
    if (pane) pane.scrollTop = pane.scrollHeight
  }, [inputRowHeight])

  function handleStep1Scroll(event: React.UIEvent<HTMLDivElement>) {
    const node = event.currentTarget
    stickToBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 4
  }

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
    // Starts at a visible jump (not 0, which reads as stalled the instant it
    // appears) and eases toward 92% — each tick covers 10% of the remaining
    // distance, so it moves quickly at first and settles into a slow creep
    // the longer the real request takes, never claiming to be done before it
    // actually is.
    setEstimateProgress(8)
    estimateProgressTimer.current = setInterval(() => {
      setEstimateProgress((p) => Math.min(92, p + (92 - p) * 0.1))
    }, 180)
    try {
      const result = await estimateNutrition({ description, photoDataUrl: photo })
      setTitle((current) => current || result.suggestedTitle)
      setNutrition({ kcal: result.kcal, protein: result.protein, carbs: result.carbs, fat: result.fat })
      setIngredients(result.ingredients)
      setMicronutrients(result.micronutrients)
      setNote(result.note)
      setManuallyEdited(false)
      setHasResult(true)
      setEstimateProgress(100)
      setStep('review')
    } catch (err) {
      setError(err instanceof GeminiError ? err.message : 'Unbekannter Fehler bei der Schätzung.')
    } finally {
      if (estimateProgressTimer.current) {
        clearInterval(estimateProgressTimer.current)
        estimateProgressTimer.current = null
      }
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
      // Only propose, never add automatically (explicit product decision):
      // a mention in the text is a strong hint, not certainty someone
      // actually took it, so this stops at "here's what we noticed" and
      // waits for a tap before touching the user's supplement list or log.
      const matches = await findUnconfirmedSupplementMatches(meal.description, meal.date)
      if (matches.length > 0) {
        setMatchedSupplements(matches)
      } else {
        requestClose()
      }
    } catch (err) {
      // Without this, a failed write (full storage, a browser/IndexedDB
      // hiccup, …) left the editor stuck on a disabled "Speichern…" button
      // with no explanation — the meal silently never made it into the feed.
      setError(describeSaveError(err, 'Mahlzeit'))
    } finally {
      setSaving(false)
    }
  }

  /**
   * A scanned barcode goes straight to Open Food Facts, per-100g, and — on
   * a match — straight into this meal's own fields rather than a separate
   * "food database" step: the app has no product catalog of its own to
   * save into first, so there's nothing a middle step would add except a
   * second confirmation for data that's already exact, unlike an AI guess.
   * Kept as its own ingredient (amount 100, unit "g") rather than folded
   * only into the totals, so the review step's existing per-ingredient
   * amount field is immediately how someone corrects the portion size —
   * "the tub was 250g, not 100g" is a number edit, not a re-scan.
   */
  async function handleBarcodeDetected(barcode: string) {
    setBarcodeStep('looking-up')
    const match = await lookupFoodByBarcode(barcode)
    if (!match) {
      setBarcodeStep('not-found')
      return
    }
    setDescription(match.name)
    setTitle(match.name)
    setIngredients([
      { name: match.name, amount: 100, unit: 'g', kcal: match.kcal100g, protein: match.protein100g, carbs: match.carbs100g, fat: match.fat100g },
    ])
    setNutrition({ kcal: match.kcal100g, protein: match.protein100g, carbs: match.carbs100g, fat: match.fat100g })
    setManuallyEdited(false)
    setHasResult(true)
    setStep('review')
    setBarcodeStep('idle')
  }

  async function openBarcodeScanner() {
    setBarcodeLoadError(null)
    try {
      const { BarcodeScanner } = await import('./BarcodeScanner')
      setBarcodeScannerComp(() => BarcodeScanner)
      setBarcodeStep('scanning')
    } catch (err) {
      setBarcodeLoadError(
        err instanceof Error && /import|fetch|network/i.test(err.message)
          ? 'Scanner-Modul konnte nicht geladen werden. Internetverbindung prüfen und erneut versuchen.'
          : 'Scanner konnte nicht gestartet werden.',
      )
    }
  }

  if (barcodeStep === 'scanning' && BarcodeScannerComp) {
    return <BarcodeScannerComp onDetected={handleBarcodeDetected} onCancel={() => setBarcodeStep('idle')} />
  }
  if (barcodeStep === 'looking-up') {
    return (
      <div className="flex flex-col items-center gap-3 p-5 pt-7">
        <BouncingDots />
        <p className="text-sm text-ink-soft">Produkt wird gesucht…</p>
      </div>
    )
  }
  if (barcodeStep === 'not-found') {
    return (
      <div className="flex flex-col gap-4 p-5 pt-7">
        <h2 className="text-lg font-semibold text-ink">Kein Produkt gefunden</h2>
        <p className="text-sm text-ink-soft">
          Dieser Barcode ist bei Open Food Facts nicht hinterlegt, oder der Eintrag hat keine vollständigen
          Nährwertangaben. Du kannst es erneut versuchen oder die Mahlzeit wie gewohnt beschreiben.
        </p>
        <button
          type="button"
          onClick={() => setBarcodeStep('scanning')}
          className="w-full rounded-2xl bg-accent/12 py-3 text-sm font-semibold text-accent hover:bg-accent/20"
        >
          Erneut scannen
        </button>
        <button
          type="button"
          onClick={() => setBarcodeStep('idle')}
          className="w-full rounded-2xl bg-bg py-3 text-sm font-medium text-ink-soft hover:bg-line"
        >
          Manuell eingeben
        </button>
      </div>
    )
  }

  /**
   * Confirms one detected supplement: adds it to the user's list first if
   * it isn't already there (with the meal's own type standing in for a
   * time-of-day slot, the only signal available for something never
   * configured before), then checks it off for today either way.
   */
  async function confirmSupplementMatch(match: SupplementMatch) {
    let mySupplementId = match.existingId
    let timeOfDay = mealTypeToSupplementTimeOfDay(mealType)
    if (mySupplementId) {
      // Already on the list — check off one of ITS OWN configured slots,
      // not the meal-derived one: a slot outside my.timesOfDay would log an
      // entry the adherence score and the checklist UI both silently
      // ignore (see SupplementScoreCard's activeTimes filter), an invisible
      // no-op that would look like nothing happened.
      const existing = await db.mySupplements.get(mySupplementId)
      timeOfDay = existing?.timesOfDay[0] ?? timeOfDay
    } else {
      await addMySupplement({ supplementId: match.supplement.id, dosage: match.supplement.typicalDosage, timesOfDay: [timeOfDay] })
      const created = await db.mySupplements.where('supplementId').equals(match.supplement.id).first()
      if (!created) return
      mySupplementId = created.id
    }
    await toggleSupplementCheck(mySupplementId, mealDate, timeOfDay)
    setConfirmedSupplementIds((cur) => new Set(cur).add(match.supplement.id))
  }

  // A full swap of the sheet's content rather than a third carousel step:
  // the meal is already saved at this point, so there's nothing left to
  // "go back" to, and reusing the input/review translateX carousel for one
  // more state it was never built for risked breaking both of the states
  // it already handles correctly.
  if (matchedSupplements) {
    return (
      <div className="flex flex-col gap-4 p-5 pt-7">
        <h2 className="text-lg font-semibold text-ink">Supp erkannt</h2>
        <p className="text-sm text-ink-soft">
          In deiner Beschreibung erwähnt — heute als eingenommen markieren?
        </p>
        <div className="flex flex-col gap-2">
          {matchedSupplements.map((match) => {
            const confirmed = confirmedSupplementIds.has(match.supplement.id)
            return (
              <div key={match.supplement.id} className="flex items-center justify-between gap-3 rounded-2xl bg-bg px-4 py-3">
                <span className="min-w-0 truncate text-sm font-medium text-ink">{match.supplement.name}</span>
                <button
                  type="button"
                  onClick={() => confirmSupplementMatch(match)}
                  disabled={confirmed}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    confirmed ? 'bg-surface text-ink-soft' : 'bg-accent/12 text-accent hover:bg-accent/20'
                  }`}
                >
                  {confirmed ? 'Erledigt' : 'Als eingenommen markieren'}
                </button>
              </div>
            )
          })}
        </div>
        <button
          type="button"
          onClick={requestClose}
          className="mt-2 w-full rounded-2xl bg-accent py-3 text-sm font-semibold text-white hover:opacity-90"
        >
          Fertig
        </button>
      </div>
    )
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

      <div
        className={`flex min-h-0 overflow-hidden transition-[height] duration-300 ease-out ${
          step === 'input' && !pickingRecipe ? '' : 'flex-1'
        }`}
        style={step === 'input' && !pickingRecipe ? { height: inputRowHeight } : undefined}
        {...swipeBack}
      >
        <div
          className="flex w-full shrink-0 transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${step === 'review' ? 100 : 0}%)` }}
        >
          {/* Step 1: input */}
          <div
            ref={pickingRecipe ? undefined : step1ScrollRef}
            onScroll={pickingRecipe ? undefined : handleStep1Scroll}
            // No bottom padding while collapsed: `sticky bottom-0` anchors to
            // the scrollport's padding edge, so 20px of it held the docked row
            // 20px clear of the bottom — and since the pane is exactly as tall
            // as that row, the same 20px pushed the row's top (and with it the
            // top of the text field) out above the pane, visibly clipped. The
            // row brings its own bottom padding, so nothing is lost.
            className={`w-full shrink-0 overflow-y-auto overflow-x-hidden px-5 ${
              step === 'input' && !pickingRecipe ? 'pb-0' : 'pb-5'
            }`}
          >
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
              <div ref={step1ContentRef} className="flex flex-col gap-4">
                {/* Everything here starts scrolled out of view above the
                    description field below — this pane opens already
                    scrolled to its own bottom (step1ScrollRef's effect
                    above), so only the field is on screen at first.
                    Scrolling up within the sheet reveals it, iOS-compose-
                    style, while the field stays docked via `sticky` further
                    down. */}
                <div className="flex items-center gap-3">
                  <ActionButton label="Rezept auswählen" onClick={() => setPickingRecipe(true)}>
                    <RecipeIcon />
                  </ActionButton>
                  <PhotoActionButton photo={photo} onChange={setPhoto} source="camera" />
                  <PhotoActionButton photo={photo} onChange={setPhoto} source="library" />
                  <ActionButton label="Barcode scannen" onClick={openBarcodeScanner}>
                    <BarcodeIcon />
                  </ActionButton>
                </div>

                {photo && <PhotoPreview photo={photo} onChange={setPhoto} />}

                {!hasApiKey && (
                  <p className="rounded-2xl bg-fat/15 px-3 py-2 text-xs text-ink">
                    Kein API-Key hinterlegt.{' '}
                    <Link to="/settings/api" onClick={requestClose} className="font-semibold underline">
                      Jetzt in den Einstellungen eintragen
                    </Link>
                    , um Nährwerte automatisch schätzen zu lassen.
                  </p>
                )}

                {barcodeLoadError && <p className="text-sm font-medium text-danger">{barcodeLoadError}</p>}

                {error && <p className="text-sm font-medium text-danger">{error}</p>}

                <MealSuggestions mealType={mealType} onPick={handleSelectSuggestion} onEdit={handleEditSuggestion} />

                {/* The docked field itself — `sticky bottom-0` within this
                    pane's own scroll container (not `position: fixed`,
                    which a transformed ancestor like the sheet's own drag
                    `y` would resolve against the wrong containing block,
                    same trap Sheet.tsx's own doc comment already explains).
                    A near-opaque background masks whatever's mid-scroll
                    behind it, matching the scroll-edge-fade every other
                    docked field in the app already uses. */}
                <div ref={inputRowRef} className="sticky bottom-0 -mx-5 bg-bg/70 px-5 pb-1 pt-2 backdrop-blur-xl">
                  <div className="flex items-start gap-2">
                    {/* `relative` so the dictation button can sit inside the
                        field's own right edge while it is still one line. */}
                    <div className="relative flex-1">
                      <AutoGrowTextarea
                        value={description}
                        onChange={setDescription}
                        disabled={cleaningUp}
                        // One line to start with, level with the send button
                        // beside it. It grows from here; the label that used
                        // to sit above is now the placeholder, because a
                        // messenger field explains itself and a caption over
                        // a single line just costs a line.
                        minHeight={44}
                        onWrappedChange={setDescriptionWrapped}
                        placeholder="Was hast du gegessen?"
                        className={`glass-subtle glass-subtle-themed w-full rounded-2xl py-3 pl-3.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40 ${
                          // Room for the embedded mic only while it is in
                          // there — once it moves out, the text may use the
                          // full width.
                          descriptionWrapped ? 'pr-3.5' : 'pr-11'
                        } ${cleaningUp ? 'opacity-50' : ''}`}
                      />
                      {!descriptionWrapped && (
                        <span className="absolute bottom-[0.4rem] right-2">
                          <DictationButton onRecordingDone={handleDictationDone} disabled={cleaningUp} variant="inline" />
                        </span>
                      )}
                    </div>
                    {/* Send stays pinned top-right for the whole life of the
                        field, however tall it grows. The dictation button
                        joins it underneath only once the field has wrapped
                        and there is no longer room for it inside. */}
                    <div className="flex shrink-0 flex-col gap-2">
                      <ActionButton
                        label="Nährwerte schätzen"
                        onClick={handleEstimate}
                        disabled={estimating || cleaningUp || !hasApiKey}
                        primary
                      >
                        {estimating ? <BouncingDots /> : <SendIcon />}
                      </ActionButton>
                      {descriptionWrapped && (
                        <DictationButton onRecordingDone={handleDictationDone} disabled={cleaningUp} variant="floating" />
                      )}
                    </div>
                  </div>
                  {cleaningUp && (
                    <p className="mt-1.5 flex items-center gap-2 text-xs text-ink-soft">
                      <BouncingDots /> Diktat wird bereinigt…
                    </p>
                  )}
                  {estimating && (
                    <div className="mt-1.5">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                        <div
                          className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out"
                          style={{ width: `${estimateProgress}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-ink-soft">Nährwerte werden geschätzt… {Math.round(estimateProgress)}%</p>
                    </div>
                  )}
                </div>
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
                          <MacroBadge type="kcal" value={ing.kcal} size="sm" />
                          <MacroRingBadge type="protein" value={ing.protein} size="sm" />
                          <MacroRingBadge type="carbs" value={ing.carbs} size="sm" />
                          <MacroRingBadge type="fat" value={ing.fat} size="sm" />
                        </div>
                        {ing.note && <p className="mt-1.5 text-xs italic text-ink-soft">{ing.note}</p>}
                      </div>
                    ))}
                  </div>
                  <div className="mb-2 flex justify-end">
                    <InfoButton label="Wie wirkt sich eine Mengenänderung aus?" title="Menge ändern">
                      Menge ändern skaliert die Nährwerte dieser Zutat automatisch (keine neue Schätzung).
                    </InfoButton>
                  </div>
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
                  <MacroBadge type="kcal" value={s.nutrition.kcal} size="sm" />
                  <MacroRingBadge type="protein" value={s.nutrition.protein} size="sm" />
                  <MacroRingBadge type="carbs" value={s.nutrition.carbs} size="sm" />
                  <MacroRingBadge type="fat" value={s.nutrition.fat} size="sm" />
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

function BarcodeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <path strokeLinecap="round" d="M4 5v14M8 5v14M11 5v14M13 5v14M16 5v14M20 5v14" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h13m0 0-5-5m5 5-5 5" />
    </svg>
  )
}
