import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { REDUCED_MOTION_TRANSITION, SPRING_SNAPPY } from '../lib/motionTokens'
import {
  db,
  mealPhotos,
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
import { DictationWaveform } from './DictationWaveform'
import { PhotoActionButton, PhotoGallery } from './PhotoInput'
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
import { useSheetExpand } from '../hooks/useSheetExpand'
import { Collapse } from './Collapse'
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

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/** Everything in this form worth carrying across an accidental close. */
interface MealDraft {
  step: Step
  hasResult: boolean
  mealDate: string
  description: string
  photos: string[]
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

/** Fallback when the snapshot won't fit in storage: photos are by far the largest field, and the ones the user can re-pick in a tap. */
function stripPhotos(draft: MealDraft): MealDraft {
  return { ...draft, photos: [] }
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
      // Opens showing only the input row; pulling up grows the sheet, and the
      // recipe/photo/barcode row and the suggestions come into view above the
      // field, which stays put at the bottom throughout. This is a height
      // change rather than one of Sheet's translate detents on purpose: a
      // detent reveals the sheet's TOP strip, and the thing that has to stay
      // on screen here sits at its bottom.
      collapsible
      // Editing an existing meal opens straight onto the review step, which
      // has no docked field to peek at in the first place — collapsing to
      // peek on mount and then immediately re-expanding would work too, but
      // risks a one-frame flash of the wrong height.
      startExpanded={Boolean(initial)}
    >
      <MealEditorContent
        date={date}
        initial={initial}
        defaultMealType={defaultMealType}
      />
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
  const expandSheet = useSheetExpand()
  const prefersReducedMotion = useReducedMotion()

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
    photos: initial ? mealPhotos(initial) : [],
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
  const [photos, setPhotos] = useState<string[]>(restored ? restored.photos : baseline.photos)
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
  // The collapsed pane is exactly as tall as the docked input row, measured
  // rather than hard-coded: the row grows when the description wraps, and a
  // fixed height clipped the top of the field off as soon as it did.
  const inputRowRef = useRef<HTMLDivElement>(null)
  // Everything the sheet shows above the carousel — its header, and the
  // restored-draft banner when there is one — counts toward both the peek
  // and the open height. Measured rather than hard-coded, so a banner
  // appearing doesn't silently push the field out of the peek.
  const headerRef = useRef<HTMLDivElement>(null)
  const bannerRef = useRef<HTMLDivElement>(null)
  const carouselRef = useRef<HTMLDivElement>(null)
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
  const [ingredientsOpen, setIngredientsOpen] = useState(false)
  /** Mirrors the inline DictationButton's own recording state — see its `onListeningChange`. */
  const [dictating, setDictating] = useState(false)
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
  // Wherever the sheet needs the whole thing — a docked field no longer
  // reflects what's on screen. Review swaps the field for the nutrition
  // form; the recipe picker and the barcode scanner replace it outright.
  // Each of those views used to sit clipped under whatever peek height the
  // field itself had needed a moment before (the field's own height has
  // nothing to do with a recipe list's or the scanner's), reachable only by
  // a drag nothing on screen hinted at.
  useEffect(() => {
    if (step === 'review' || pickingRecipe || barcodeStep !== 'idle' || matchedSupplements) {
      expandSheet()
    }
  }, [step, pickingRecipe, barcodeStep, matchedSupplements, expandSheet])

  const snapshot: MealDraft = {
    step,
    hasResult,
    mealDate,
    description,
    photos,
    mealType,
    title,
    nutrition,
    ingredients,
    micronutrients,
    note,
    manuallyEdited,
  }
  const draft = useDraftAutosave(draftId, snapshot, !isSameDraft(snapshot, baseline), stripPhotos)

  /** Drops the restored values and returns the sheet to how it opened. */
  function discardDraft() {
    setStep(baseline.step)
    setHasResult(baseline.hasResult)
    setMealDate(baseline.mealDate)
    setDescription(baseline.description)
    setPhotos(baseline.photos)
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
    if (!description.trim() && photos.length === 0) {
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
      const result = await estimateNutrition({ description, photoDataUrls: photos })
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
      photos,
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
   *
   * Appends rather than replaces: a meal is often more than one scanned
   * product (a yogurt AND its topping, both packaged), and this is also
   * what "Produkt scannen" in the review step (see below) re-invokes —
   * replacing here would silently throw away whatever was already scanned
   * or typed. Title/description follow the same rule: the first scan sets
   * them outright, a later one appends to the description without
   * clobbering a title the user may have already edited themselves.
   */
  async function handleBarcodeDetected(barcode: string) {
    setBarcodeStep('looking-up')
    const match = await lookupFoodByBarcode(barcode)
    if (!match) {
      setBarcodeStep('not-found')
      return
    }
    const newIngredient: Ingredient = {
      name: match.name,
      amount: 100,
      unit: 'g',
      kcal: match.kcal100g,
      protein: match.protein100g,
      carbs: match.carbs100g,
      fat: match.fat100g,
    }
    const nextIngredients = ingredients && ingredients.length > 0 ? [...ingredients, newIngredient] : [newIngredient]
    setIngredients(nextIngredients)
    setNutrition(sumIngredients(nextIngredients))
    setDescription((prev) => (prev.trim() ? `${prev}, ${match.name}` : match.name))
    setTitle((prev) => prev.trim() || match.name)
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
        <h2 className="font-display text-lg font-semibold text-ink">Kein Produkt gefunden</h2>
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
        <h2 className="font-display text-lg font-semibold text-ink">Supp erkannt</h2>
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
      <div ref={headerRef} className="flex shrink-0 items-center justify-between p-5 pb-4 pt-7">
        {step === 'review' ? (
          <button onClick={() => setStep('input')} className="text-ink-soft hover:text-ink" aria-label="Zurück">
            <BackIcon />
          </button>
        ) : (
          <h2 className="font-display text-lg font-semibold text-ink">{initial ? 'Mahlzeit bearbeiten' : 'Mahlzeit hinzufügen'}</h2>
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
        <div ref={bannerRef} className="shrink-0 px-5">
          <DraftRestoredBanner onDiscard={discardDraft} />
        </div>
      )}

      <div
        ref={carouselRef}
        className={`flex min-h-0 overflow-hidden ${step === 'input' && !pickingRecipe ? '' : 'flex-1'}`}

        {...swipeBack}
      >
        <div
          className="flex w-full shrink-0 transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${step === 'review' ? 100 : 0}%)` }}
        >
          {/* Step 1: input */}
          <div className="flex w-full shrink-0 flex-col overflow-hidden">
          <div
            ref={pickingRecipe ? undefined : step1ScrollRef}
            onScroll={pickingRecipe ? undefined : handleStep1Scroll}
            data-sheet-collapse
            className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5"
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
                {/* Only what pulling the sheet open reveals lives in this
                    scrolling area. The field and the four input-source
                    buttons are docked below it, outside the scroll — that is
                    what keeps both reachable without opening the sheet, and
                    it is also why neither needs `sticky` any more. */}
                {photos.length > 0 && (
                  <PhotoGallery photos={photos} onRemove={(i) => setPhotos((prev) => prev.filter((_, j) => j !== i))} />
                )}

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
              </div>
            )}
          </div>

          {/* Docked: outside the scroll area, so its height is the sheet's
              collapsed height and nothing above can bleed into it.
              `glass-docked` (index.css) is the liquid-glass treatment for
              this specific spot — no `backdrop-filter`: the sheet behind is
              opaque, so a blur here would cost a compositing layer for a
              provably invisible result (screenshots with and without were
              pixel-identical), the same finding that kept plain `.glass`
              off this row in the first place. The gradient/border/shadow
              that actually reads as "glass" stays. */}
          {!pickingRecipe && (
            <div ref={inputRowRef} data-sheet-peek className="glass-docked shrink-0 px-5 pb-4 pt-3">
                  <div className="flex items-start gap-2">
                    {/* `relative` so the dictation button can sit inside the
                        field's own right edge, however many lines it grows
                        to — `bottom`-anchored, so it stays pinned to that
                        corner rather than jumping out to make room once the
                        field wraps. It used to move out to a second position
                        under the send button at that point instead; now it
                        just fades away once there's something to dictate
                        onto, which is also the moment it would otherwise
                        have started fighting the wrapped text for the same
                        corner. */}
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
                        // Blanked while recording: the waveform below takes
                        // over the placeholder's job of saying "nothing here
                        // yet" — showing both at once would be two answers to
                        // the same question sitting on top of each other.
                        placeholder={dictating ? '' : 'Was hast du gegessen?'}
                        className={`glass-subtle glass-subtle-themed w-full rounded-2xl py-3 pl-3.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40 ${
                          // Room for the embedded mic only while it's shown —
                          // once text fades it out, the text may use the
                          // full width, wrapped or not.
                          description.trim() ? 'pr-3.5' : 'pr-11'
                        } ${cleaningUp ? 'opacity-50' : ''}`}
                      />
                      {/* Recording feedback, in the field itself rather than
                          only on the button — "im Textfeld... eine
                          Animation... als ob die KI auf meine Stimme
                          reagiert". Left-aligned where the placeholder text
                          would otherwise start; `pointer-events-none` so it
                          never stands between a tap and the field or the
                          stop button next to it. The field stays single-line
                          for the whole recording (dictation only ever lands
                          in `description` once, on stop — see
                          handleDictationDone), so a fixed vertical center is
                          always correct, never fighting a growing textarea. */}
                      <AnimatePresence>
                        {dictating && (
                          <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={prefersReducedMotion ? REDUCED_MOTION_TRANSITION : SPRING_SNAPPY}
                            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
                          >
                            <DictationWaveform />
                          </motion.span>
                        )}
                      </AnimatePresence>
                      <AnimatePresence>
                        {!description.trim() && (
                          <motion.span
                            initial={{ opacity: 0, scale: 0.6 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.6 }}
                            transition={prefersReducedMotion ? REDUCED_MOTION_TRANSITION : SPRING_SNAPPY}
                            className="absolute bottom-[0.4rem] right-2"
                          >
                            <DictationButton
                              onRecordingDone={handleDictationDone}
                              onListeningChange={setDictating}
                              disabled={cleaningUp}
                              variant="inline"
                            />
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
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

                  {/* The other four ways to describe a meal, right under the
                      field: they are alternatives to typing, so they belong
                      beside the thing they replace and have to be reachable
                      without opening the sheet. */}
                  <div className="mt-2 flex items-center gap-3">
                    <ActionButton label="Rezept auswählen" onClick={() => setPickingRecipe(true)}>
                      <RecipeIcon />
                    </ActionButton>
                    <PhotoActionButton count={photos.length} onAdd={(p) => setPhotos((prev) => [...prev, p])} source="camera" />
                    <PhotoActionButton count={photos.length} onAdd={(p) => setPhotos((prev) => [...prev, p])} source="library" />
                    <ActionButton label="Barcode scannen" onClick={openBarcodeScanner}>
                      <BarcodeIcon />
                    </ActionButton>
                  </div>
            </div>
          )}
          </div>

          {/* Step 2: review. `data-sheet-collapse` here too, alongside step
              1's own: Sheet's `maxSheetHeight()` takes the taller of every
              tagged region, so whichever step is actually on screen gets
              sized from ITS OWN content rather than from step 1's — reaching
              review used to size the sheet off the suggestions list still
              sitting off-screen in step 1, which had nothing to do with
              what review actually needed to show. */}
          <div data-sheet-collapse className="w-full shrink-0 overflow-y-auto overflow-x-hidden px-5 pb-5">
            <div className="flex flex-col gap-4">
              {/* The one place in review a photo was invisible: step 1's own
                  PhotoGallery lives in step 1's scroll area, which review
                  doesn't share — attaching a photo, then estimating, landed
                  on review with no sign it existed at all until save. */}
              {photos.length > 0 && (
                <PhotoGallery photos={photos} onRemove={(i) => setPhotos((prev) => prev.filter((_, j) => j !== i))} />
              )}

              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink-soft">Datum</span>
                <input
                  type="date"
                  value={mealDate}
                  onChange={(e) => e.target.value && setMealDate(e.target.value)}
                  className="field rounded-2xl px-3 py-2 text-sm"
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
                  className="field rounded-2xl px-3 py-2 text-sm"
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
                  {/* Closed by default: the review step opens straight to
                      full height (see useSheetExpand above), and Zutaten is
                      the one section that can genuinely run long (a
                      multi-ingredient dish, easily a dozen rows) — left
                      expanded, it was the reason Nährwerte and Speichern
                      needed a scroll to reach even at that full height. This
                      is the one thing on this step someone reliably wants
                      collapsed rather than reachable at a glance. */}
                  <button
                    type="button"
                    onClick={() => setIngredientsOpen((v) => !v)}
                    className="mb-2 flex w-full items-center justify-between text-left"
                  >
                    <span className="text-xs text-ink-soft">Zutaten ({ingredients.length})</span>
                    <ChevronDownIcon open={ingredientsOpen} />
                  </button>
                  <Collapse open={ingredientsOpen}>
                    <div className="flex flex-col gap-2 pb-2">
                      {ingredients.map((ing, i) => (
                        <div key={i} className="rounded-2xl border border-line p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-ink">{ing.name}</span>
                            <div className="flex shrink-0 items-center gap-1">
                              <NumberField
                                value={ing.amount}
                                onChange={(next: number) => handleIngredientAmountChange(i, next)}
                                ariaLabel={`Menge für ${ing.name}`}
                                className="field w-16 rounded-lg px-1.5 py-1 text-right text-xs"
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
                  </Collapse>
                </div>
              )}

              {/* Reachable from review, not just from the input step's docked
                  row: a meal is often more than one scanned product (see
                  handleBarcodeDetected's own doc comment), and without this
                  the only way to add a second one was to save this meal,
                  reopen the editor, and scan into an unrelated new entry —
                  exactly the "muss erst eine Mahlzeit anlegen" complaint. */}
              <button
                type="button"
                onClick={openBarcodeScanner}
                className="flex items-center justify-center gap-1.5 rounded-2xl border border-line py-2.5 text-sm font-medium text-ink-soft transition hover:bg-bg"
              >
                <BarcodeIcon className="h-4 w-4" />
                Weiteres Produkt scannen
              </button>

              {barcodeLoadError && <p className="text-sm font-medium text-danger">{barcodeLoadError}</p>}

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

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      className={`h-4 w-4 shrink-0 text-ink-soft transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
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

function BarcodeIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
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
