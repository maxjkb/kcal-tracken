import Dexie, { type EntityTable } from 'dexie'

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface Nutrition {
  kcal: number
  protein: number // g
  carbs: number // g
  fat: number // g
}

/**
 * The curated set of micronutrients Tracke estimates — the ones the DGE
 * itself names as the population's most common shortfalls (Vitamin D, B12,
 * Folat, Magnesium, Eisen, Calcium), plus Vitamin C, Zink, Kalium and Jod for
 * broader everyday coverage. Deliberately not the full ~30-entry DACH table:
 * a text/photo estimate is already loose for macros, and asking for every
 * known micronutrient would multiply that looseness without the UI being
 * able to show it honestly. See lib/micronutrients.ts for how these numbers
 * turn into the "gut/durchschnittlich/unterrepräsentiert" bands actually
 * shown — the numbers themselves are never displayed.
 */
export type MicronutrientKey =
  | 'vitaminD'
  | 'vitaminB12'
  | 'folate'
  | 'vitaminC'
  | 'calcium'
  | 'iron'
  | 'magnesium'
  | 'zinc'
  | 'potassium'
  | 'iodine'

/**
 * Importance ranking, most important first — drives MicronutrientBars'
 * grid top-to-bottom (that component simply renders this array in order,
 * two per row), per explicit request: whichever nutrient sits higher on
 * screen is the one this app considers more important, full stop, not a
 * reflection of anything else (alphabetical, unit, whatever).
 *
 * The first six are the DGE's own named "most common shortfalls" this
 * curated set was built from (see the MicronutrientKey doc comment above) —
 * ranked further within that six by how severe and widespread a real
 * deficiency is: Vitamin D and Eisen (iron) are the two Germany-wide
 * population deficiencies with real health consequences (bone/immune;
 * anaemia) and get the top two tiles; B12 and Folat follow as the other two
 * DGE deficiencies with serious consequences if actually deficient (nerve/
 * blood; neural-tube risk in pregnancy); Calcium and Magnesium close out the
 * six — common gaps, but slower-consequence ones. The last four exist for
 * "broader everyday coverage" rather than being named DGE shortfalls, so
 * they rank below all six: Zink and Kalium (still genuinely common
 * Western-diet gaps) above Vitamin C and Jod (usually adequately covered —
 * diet in the first case, iodized salt in the second — so a real gap is the
 * least likely of the ten).
 */
export const MICRONUTRIENT_ORDER: MicronutrientKey[] = [
  'vitaminD',
  'iron',
  'vitaminB12',
  'folate',
  'calcium',
  'magnesium',
  'zinc',
  'potassium',
  'vitaminC',
  'iodine',
]

export const MICRONUTRIENT_LABELS: Record<MicronutrientKey, string> = {
  vitaminD: 'Vitamin D',
  vitaminB12: 'Vitamin B12',
  folate: 'Folat',
  vitaminC: 'Vitamin C',
  calcium: 'Calcium',
  iron: 'Eisen',
  magnesium: 'Magnesium',
  zinc: 'Zink',
  potassium: 'Kalium',
  iodine: 'Jod',
}

export const MICRONUTRIENT_UNITS: Record<MicronutrientKey, string> = {
  vitaminD: 'µg',
  vitaminB12: 'µg',
  folate: 'µg',
  vitaminC: 'mg',
  calcium: 'mg',
  iron: 'mg',
  magnesium: 'mg',
  zinc: 'mg',
  potassium: 'mg',
  iodine: 'µg',
}

/** One meal's or recipe's estimated micronutrient content, same units as MICRONUTRIENT_UNITS. */
export type Micronutrients = Record<MicronutrientKey, number>

export interface Ingredient {
  name: string
  /** Numeric quantity actually consumed (matches the nutrition values below), editable by the user. */
  amount: number
  /** Unit for `amount`, e.g. "g", "ml", "Stück", "EL". */
  unit: string
  kcal: number
  protein: number
  carbs: number
  fat: number
  /** Optional AI remark about this specific ingredient (e.g. an assumption made), only when relevant. */
  note?: string
}

/**
 * A saved meal's ingredient amount used to be a single free-text string
 * (e.g. "150 g" or "1 Stück (ca. 120g)") before amount/unit were split into
 * separate editable fields. Renders old records without crashing.
 */
export function formatIngredientAmount(ing: Pick<Ingredient, 'amount' | 'unit'>): string {
  if (typeof ing.amount !== 'number') return String(ing.amount)
  return `${ing.amount} ${ing.unit ?? ''}`.trim()
}

export interface Meal {
  id: string
  /** ISO date string, e.g. "2026-08-23" — the day this meal belongs to (local time). */
  date: string
  mealType: MealType
  title: string
  /** The raw text the user typed/dictated describing the meal. */
  description: string
  /** Optional photo, stored as a data URL (base64) directly in IndexedDB. */
  photo?: string
  nutrition: Nutrition
  /** Per-ingredient breakdown from the AI estimate, if any. Read-only detail info — reflects the estimate at the time it ran, not necessarily in sync with later manual edits to `nutrition`. */
  ingredients?: Ingredient[]
  /**
   * Estimated micronutrient content, if this meal ever went through an AI
   * estimate. Undefined for meals entered before this existed and for
   * purely manual entries (nothing ever asked Gemini) — both are simply
   * left out of the rolling micronutrient average rather than counted as
   * zero, so an old meal doesn't drag every band down to "unterrepräsentiert".
   */
  micronutrients?: Micronutrients
  /** Optional overall AI remark about the whole meal (e.g. an assumption made), only when relevant. */
  note?: string
  /** Whether nutrition values were ever manually edited by the user. */
  manuallyEdited: boolean
  createdAt: number
  updatedAt: number
}

export interface RecipeStep {
  order: number
  text: string
}

/**
 * A saved recipe — created similarly to a meal (free-text/dictated
 * description → AI structures it), but without a photo, and split further
 * into a "Zubereitung" (preparation steps) alongside the ingredient
 * breakdown. Filed under one of the same four categories as meals
 * (Frühstück/Mittag/Abend/Snack) so it slots into the existing Rezepte
 * navigation, and can be picked as a meal's contents when logging a meal.
 */
export interface Recipe {
  id: string
  category: MealType
  title: string
  /** The raw text the user typed/dictated describing the recipe. */
  description: string
  ingredients: Ingredient[]
  /** Preparation steps, in order — structured by the AI from free text, freely editable afterward. */
  steps: RecipeStep[]
  nutrition: Nutrition
  /** Estimated micronutrient content — see Meal.micronutrients. Carried over onto the logged Meal when this recipe is picked in the editor. */
  micronutrients?: Micronutrients
  /** Whether nutrition values were ever manually edited by the user. */
  manuallyEdited: boolean
  createdAt: number
  updatedAt: number
}

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Frühstück',
  lunch: 'Mittagessen',
  dinner: 'Abendessen',
  snack: 'Snack',
}

export const MEAL_TYPE_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

/**
 * When during the day a supplement is taken. Deliberately its own set of
 * boundaries, not reused from meal-type time guessing — "Nachts" (e.g.
 * magnesium before bed) has no equivalent among meals, which never has a
 * genuine late-night category.
 */
export type SupplementTimeOfDay = 'morning' | 'noon' | 'evening' | 'night'

export const SUPPLEMENT_TIME_LABELS: Record<SupplementTimeOfDay, string> = {
  morning: 'Morgens',
  noon: 'Mittags',
  evening: 'Abends',
  night: 'Nachts',
}

export const SUPPLEMENT_TIME_ORDER: SupplementTimeOfDay[] = ['morning', 'noon', 'evening', 'night']

/**
 * Purely additive since the original three: the catalog grew from 10 entries
 * to ~90, at which point three buckets meant scrolling thirty items to find
 * one. Old values keep their meaning, so anything already stored — including
 * the user's own custom entries — stays valid without a data migration.
 */
export type SupplementCategory =
  | 'build_muscle'
  | 'endurance'
  | 'recovery'
  | 'joints'
  | 'immune'
  | 'cognition'
  | 'gut'
  | 'general_health'

export const SUPPLEMENT_CATEGORY_LABELS: Record<SupplementCategory, string> = {
  build_muscle: 'Muskelaufbau & Kraft',
  endurance: 'Ausdauer & Leistung',
  recovery: 'Erholung & Schlaf',
  joints: 'Gelenke & Knochen',
  immune: 'Immunsystem',
  cognition: 'Fokus & Kognition',
  gut: 'Darm & Verdauung',
  general_health: 'Vitamine & Grundversorgung',
}

/**
 * A known supplement — the catalog entry. Both the built-in seed list
 * (`lib/supplementSeed.ts`) and anything the user adds manually live in this
 * same table; `isCustom` is purely informational (e.g. to label it in the
 * catalog), both behave identically everywhere else.
 */
export interface Supplement {
  id: string
  name: string
  category: SupplementCategory
  /** Short one-line description of what it's commonly used for. */
  description: string
  /** Typical dosage as free text (e.g. "3–5 g") — units vary too much (g/mg/IE/Kapseln) for a structured amount+unit pair to pay off here. */
  typicalDosage: string
  isCustom: boolean
  createdAt: number
}

/**
 * One supplement the user has actually added to their own routine —
 * references a `Supplement` catalog entry plus the user's personal dosage
 * and the times of day they take it. `timesOfDay` drives how many check
 * slots show up for this entry in the daily checklist — a supplement taken
 * once a day only ever shows one slot, not four mostly-irrelevant ones.
 */
export interface MySupplement {
  id: string
  supplementId: string
  timesOfDay: SupplementTimeOfDay[]
  /** Personal dosage note, prefilled from the catalog's typicalDosage but freely editable. */
  dosage: string
  createdAt: number
}

/**
 * One taken check-in for one (supplement, day, time-of-day) slot. Only
 * positive check-ins are ever stored — same principle as meals never
 * getting an "empty" placeholder row: a slot with no matching entry reads
 * as "not taken (yet)", not as an explicit false needing its own row.
 * Whether that then renders as pending or missed is a pure function of the
 * current time relative to the slot's window, computed at render time.
 */
export interface SupplementLogEntry {
  id: string
  mySupplementId: string
  /** Local date key (YYYY-MM-DD) this check-in belongs to. */
  date: string
  timeOfDay: SupplementTimeOfDay
  checkedAt: number
}

/**
 * One supplement suggestion. Lives here rather than in gemini.ts because it's
 * now persisted (see SupplementAdvisorRun) — and gemini.ts already imports its
 * enums from this file, so the reverse direction would be a cycle.
 */
export interface SupplementRecommendation {
  supplementName: string
  category: SupplementCategory
  suggestedDosage: string
  suggestedTimesOfDay: SupplementTimeOfDay[]
  reasoning: string
  /**
   * `new` = not on the list yet. `consistency` = already on the list but taken
   * too irregularly to do anything, so the suggestion is to actually stick
   * with it rather than to add something else.
   */
  kind: 'new' | 'consistency'
}

/**
 * The nutrition and routine situation one advisor run was based on. Stored
 * alongside the suggestions so the *next* run can be told what has actually
 * changed since — which is what lets it keep a recommendation's wording
 * stable while nothing moved, and explain itself when something did.
 */
export interface SupplementAdvisorContext {
  goalLabel: string
  dailyTargets: Nutrition | null
  averageIntake: Nutrition
  periodDays: number
  /** Names taken on at least ESTABLISHED_DAYS of the last 30 days. */
  established: string[]
  /** Micronutrients whose rolling 7-day average sits in the "unterrepräsentiert" band (see lib/micronutrients.ts) — German labels, empty when there's no body profile or no such gap. */
  lowMicronutrients: string[]
}

/**
 * One day's supplement suggestions, kept for a week.
 *
 * The point of storing these is consistency, not history: without a record of
 * what was suggested and *why*, every regeneration started from nothing and
 * could argue Omega-3 differently on Tuesday than on Monday for no reason the
 * user could see. With it, the model is handed its own previous reasoning and
 * asked to keep it unless the underlying data actually moved. Never shown
 * directly — the UI only ever renders the newest run.
 */
export interface SupplementAdvisorRun {
  id: string
  /** Local date key (YYYY-MM-DD) — at most one run per day. */
  date: string
  generatedAt: number
  suggestions: SupplementRecommendation[]
  context: SupplementAdvisorContext
}

/**
 * One "was jetzt essen"-tip, grounded in today's remaining macro gaps and the
 * current time-of-day slot rather than a full recipe — a food category or two
 * (e.g. "Thunfisch, Hähnchenbrust oder Hüttenkäse"), not a dish to cook.
 */
export interface TipSuggestion {
  /** Which target this tip closes — drives the icon shown. 'general' for anything not tied to one macro (e.g. a timing nudge). */
  focus: 'kcal' | 'protein' | 'carbs' | 'fat' | 'general'
  /** Short, concrete suggestion naming actual foods. */
  suggestion: string
  /** One-sentence reason, e.g. why this closes a gap or fits the time of day. */
  reason: string
}

/** What one tips run was based on — kept alongside the tips themselves purely for future reference, never re-sent to the model (unlike the supplement advisor, tips have no "keep the previous wording stable" requirement, so nothing reads this back). */
export interface TipsContext {
  slot: MealType
  dailyTargets: Nutrition | null
  consumedSoFar: Nutrition
  loggedTitles: string[]
}

/**
 * One time-slot's worth of tips, kept for a couple of days.
 *
 * Keyed by (date, slot) rather than just date: refreshing "per meal window"
 * (breakfast/lunch/snack/dinner — the same four buckets lib/mealTypeGuess.ts
 * already uses to default a new meal's type) is the whole point, so a run
 * from this morning must not be mistaken for still current at dinner time.
 */
export interface TipsRun {
  id: string
  /** Local date key (YYYY-MM-DD). */
  date: string
  slot: MealType
  generatedAt: number
  tips: TipSuggestion[]
  context: TipsContext
}

class KcalDatabase extends Dexie {
  meals!: EntityTable<Meal, 'id'>
  recipes!: EntityTable<Recipe, 'id'>
  supplements!: EntityTable<Supplement, 'id'>
  mySupplements!: EntityTable<MySupplement, 'id'>
  supplementLog!: EntityTable<SupplementLogEntry, 'id'>
  supplementAdvisorRuns!: EntityTable<SupplementAdvisorRun, 'id'>
  tipRuns!: EntityTable<TipsRun, 'id'>

  constructor() {
    super('kcal-tracker')
    this.version(1).stores({
      meals: 'id, date, mealType, createdAt',
    })
    this.version(2).stores({
      meals: 'id, date, mealType, createdAt',
      recipes: 'id, category, createdAt',
    })
    this.version(3).stores({
      meals: 'id, date, mealType, createdAt',
      recipes: 'id, category, createdAt',
      supplements: 'id, name, category, createdAt',
      mySupplements: 'id, supplementId, createdAt',
      supplementLog: 'id, mySupplementId, date, [mySupplementId+date+timeOfDay]',
    })
    this.version(4).stores({
      meals: 'id, date, mealType, createdAt',
      recipes: 'id, category, createdAt',
      supplements: 'id, name, category, createdAt',
      mySupplements: 'id, supplementId, createdAt',
      supplementLog: 'id, mySupplementId, date, [mySupplementId+date+timeOfDay]',
      supplementAdvisorRuns: 'id, date, generatedAt',
    })
    this.version(5).stores({
      meals: 'id, date, mealType, createdAt',
      recipes: 'id, category, createdAt',
      supplements: 'id, name, category, createdAt',
      mySupplements: 'id, supplementId, createdAt',
      supplementLog: 'id, mySupplementId, date, [mySupplementId+date+timeOfDay]',
      supplementAdvisorRuns: 'id, date, generatedAt',
      tipRuns: 'id, date, generatedAt, [date+slot]',
    })
  }
}

export const db = new KcalDatabase()

export function newMealId(): string {
  return crypto.randomUUID()
}

export function newRecipeId(): string {
  return crypto.randomUUID()
}

export function newSupplementId(): string {
  return crypto.randomUUID()
}

export function newMySupplementId(): string {
  return crypto.randomUUID()
}

export function newSupplementLogId(): string {
  return crypto.randomUUID()
}

export function newSupplementAdvisorRunId(): string {
  return crypto.randomUUID()
}

export function newTipsRunId(): string {
  return crypto.randomUUID()
}

/** Local ISO date (YYYY-MM-DD) without timezone shifting, unlike toISOString(). */
export function toLocalDateKey(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
