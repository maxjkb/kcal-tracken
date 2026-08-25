import { getApiKey } from './settings'
import { searchFoodDatabaseMany, type FoodDatabaseMatch } from './foodDatabase'
import type { MealType, SupplementCategory, SupplementRecommendation, SupplementTimeOfDay } from './db'

import { DEFAULT_MODEL, markExhausted, modelOrder } from './geminiModels'
import { recordUsage } from './usageQuota'

const MODEL_STORAGE_KEY = 'kcal-tracker:gemini-model'

export function getModel(): string {
  try {
    return localStorage.getItem(MODEL_STORAGE_KEY) || DEFAULT_MODEL
  } catch {
    return DEFAULT_MODEL
  }
}

export function setModel(model: string): void {
  localStorage.setItem(MODEL_STORAGE_KEY, model.trim() || DEFAULT_MODEL)
}

export class GeminiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'GeminiError'
    this.status = status
  }
}

export interface IngredientEstimate {
  name: string
  amount: number
  unit: string
  kcal: number
  protein: number
  carbs: number
  fat: number
  note?: string
}

export interface NutritionEstimate {
  suggestedTitle: string
  ingredients: IngredientEstimate[]
  kcal: number
  protein: number
  carbs: number
  fat: number
  note?: string
}

const NUTRITION_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    suggestedTitle: {
      type: 'STRING',
      description: 'Kurzer, prägnanter Titel für das Gericht auf Deutsch, z.B. "Hähnchen mit Reis".',
    },
    ingredients: {
      type: 'ARRAY',
      description: 'Einzelne Zutaten der Mahlzeit mit jeweils eigener Mengen- und Nährwertangabe.',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: 'Name der Zutat, z.B. "Hähnchenbrust".' },
          amount: {
            type: 'NUMBER',
            description:
              'Numerische Menge, die TATSÄCHLICH VERZEHRT wurde (passend zu den unten angegebenen Nährwerten dieser Zutat) — z.B. 200, nicht "200g" als Text. Wurde nur ein Teil einer zubereiteten Menge gegessen, ist dies die gegessene Teilmenge, nicht die zubereitete Gesamtmenge.',
          },
          unit: { type: 'STRING', description: 'Kurze Einheit zu "amount", z.B. "g", "ml", "Stück", "EL", "TL".' },
          kcal: { type: 'NUMBER', description: 'Kalorien dieser Zutat in der angegebenen (verzehrten) Menge.' },
          protein: { type: 'NUMBER', description: 'Protein dieser Zutat in Gramm.' },
          carbs: { type: 'NUMBER', description: 'Kohlenhydrate dieser Zutat in Gramm.' },
          fat: { type: 'NUMBER', description: 'Fett dieser Zutat in Gramm.' },
          note: {
            type: 'STRING',
            description:
              'NUR falls für diese Zutat eine Annahme nötig war (z.B. roh/gekocht, nur Teilmenge einer zubereiteten Menge gegessen, Fettgehalt) — sonst weglassen.',
          },
        },
        required: ['name', 'amount', 'unit', 'kcal', 'protein', 'carbs', 'fat'],
      },
    },
    note: {
      type: 'STRING',
      description: 'NUR falls eine übergreifende Annahme zur gesamten Mahlzeit nötig war — sonst weglassen.',
    },
  },
  required: ['suggestedTitle', 'ingredients'],
}

const SYSTEM_PROMPT = `Du bist ein Ernährungsassistent. Der Nutzer beschreibt eine Mahlzeit (Text und/oder Foto) auf Deutsch, ggf. mit ungefähren Mengenangaben in Gramm oder Haushaltsmaßen. Zerlege die Mahlzeit in ihre einzelnen Zutaten und schätze für JEDE Zutat einzeln die Nährwerte auf Basis üblicher Standard-Nährwerttabellen (wie z.B. USDA oder gängige Lebensmitteldatenbanken) für die TATSÄCHLICH VERZEHRTE Menge (nicht pro 100g). "amount" muss diese verzehrte Menge als reine Zahl enthalten (die Einheit kommt separat in "unit"), passend zu den angegebenen Nährwerten — wurde z.B. nur die Hälfte einer zubereiteten Soße gegessen, ist "amount" die gegessene Teilmenge, nicht die zubereitete Gesamtmenge. Wenn Mengenangaben fehlen, nimm plausible durchschnittliche Portionsgrößen an. Schreibe eine "note" nur dort, wo wirklich eine relevante Annahme getroffen wurde (z.B. "Nudeln ungekocht angenommen", "nur die Hälfte der zubereiteten Menge gegessen") — bei eindeutigen Zutaten bleibt "note" weg. Betrifft eine Annahme eine EINZELNE Zutat, schreibe sie IMMER in die "note" dieser Zutat, niemals in die übergreifende "note" der Mahlzeit — die übergreifende "note" ist ausschließlich für Annahmen reserviert, die sich nicht einer einzelnen Zutat zuordnen lassen. Werden dir zusätzlich Referenz-Nährwerte aus einer Lebensmitteldatenbank mitgegeben, nutze diese bevorzugt für Zutaten, auf die sie wirklich zutreffen (auf die verzehrte Menge skaliert) — ignoriere sie für Zutaten, auf die sie nicht passen. Antworte ausschließlich als JSON gemäß dem vorgegebenen Schema.`

const FOOD_EXTRACTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    foods: {
      type: 'ARRAY',
      description:
        'Kurze, einzelne, durchsuchbare Lebensmittel-/Produktnamen, die im Text vorkommen (z.B. "Fix-Tomatensauce", "Hähnchenbrust") — ohne Mengenangaben, ohne Zubereitungsart, maximal 6 Einträge.',
      items: { type: 'STRING' },
    },
  },
  required: ['foods'],
}

const FOOD_EXTRACTION_SYSTEM_PROMPT = `Extrahiere aus der folgenden Beschreibung einer Mahlzeit oder eines Rezepts eine kurze Liste der darin vorkommenden Lebensmittel/Zutaten als einzelne, durchsuchbare Produktnamen (ohne Mengen, ohne Zubereitungsart). Antworte ausschließlich als JSON gemäß dem vorgegebenen Schema.`

/**
 * Grounding step shared by meal-, recipe- and single-ingredient estimation:
 * a lightweight extraction call pulls out candidate food names from the
 * free-text description, each is looked up in Open Food Facts, and any
 * real matches are formatted into extra context for the main estimate
 * call. Best-effort throughout — a failure anywhere here (extraction call,
 * network, no matches) just means no grounding context is added, and the
 * main estimate proceeds exactly as it did before this existed.
 */
async function buildGroundingContext(description: string): Promise<string | null> {
  if (!description.trim()) return null

  let names: string[]
  try {
    const parsed = await callGemini({
      systemPrompt: FOOD_EXTRACTION_SYSTEM_PROMPT,
      parts: [{ text: description }],
      responseSchema: FOOD_EXTRACTION_SCHEMA,
    })
    const foods = Array.isArray(parsed.foods) ? parsed.foods : []
    names = foods.map((f) => String(f)).filter(Boolean).slice(0, 6)
  } catch {
    return null
  }
  if (names.length === 0) return null

  const matches = await searchFoodDatabaseMany(names)
  if (matches.length === 0) return null

  return formatGroundingContext(matches)
}

function formatGroundingContext(matches: FoodDatabaseMatch[]): string {
  const lines = matches.map(
    (m) =>
      `- ${m.name}: ${m.kcal100g} kcal, ${m.protein100g}g Protein, ${m.carbs100g}g Kohlenhydrate, ${m.fat100g}g Fett (jeweils pro 100g/100ml)`,
  )
  return `Referenz-Nährwerte aus einer Lebensmitteldatenbank (Open Food Facts) für ähnliche Produkte:\n${lines.join('\n')}`
}

const DICTATION_CLEANUP_SCHEMA = {
  type: 'OBJECT',
  properties: {
    cleanedText: {
      type: 'STRING',
      description: 'Der bereinigte, gut lesbare Beschreibungstext der Mahlzeit.',
    },
  },
  required: ['cleanedText'],
}

const DICTATION_CLEANUP_SYSTEM_PROMPT = `Der Nutzer hat per Spracherkennung eine Mahlzeit beschrieben. Das Rohtranskript kann Wiederholungen, Versprecher, Füllwörter oder Erkennungsfehler enthalten. Formuliere daraus einen klaren, kurzen, gut lesbaren Beschreibungstext auf Deutsch, der weiterhin exakt dieselben Zutaten und Mengenangaben enthält wie das Original. Erfinde nichts hinzu, entferne nichts Inhaltliches, korrigiere nur Sprache/Wiederholungen. Antworte ausschließlich als JSON gemäß dem vorgegebenen Schema.`

interface GeminiPart {
  text?: string
  inline_data?: { mime_type: string; data: string }
}

interface GeminiResponse {
  candidates?: { content: { parts: GeminiPart[] } }[]
  error?: { message: string }
  promptFeedback?: { blockReason?: string }
}

/**
 * Runs a request against the first model that still has quota, falling through
 * the rest on the way.
 *
 * The previous version fell back exactly once, to a single hard-coded model,
 * and gave up if that was also spent — so a busy day ended with the feature
 * simply unavailable even though other models were untouched. It now walks the
 * whole chain (see geminiModels.ts) and remembers which models reported
 * exhaustion today, so subsequent requests skip straight past them instead of
 * spending a failed round-trip on each one. The markers expire at the Pacific
 * day boundary, which is when the quotas actually reset, so a recovered model
 * comes back into rotation by itself.
 *
 * The model chosen in Settings is *not* overwritten when a fallback succeeds.
 * It used to be, which meant one exhausted day silently and permanently
 * changed a setting the user had picked. The exhaustion markers are persisted
 * instead, so later sessions still skip the dead models without touching the
 * preference — and once they expire, the chosen model comes back on its own.
 * Errors that aren't about quota (a bad key, a blocked prompt, no network)
 * are thrown immediately — trying three models against a wrong API key would
 * just be three times the wait for the same message.
 */
async function callGemini(params: {
  systemPrompt: string
  parts: GeminiPart[]
  responseSchema: object
}): Promise<Record<string, unknown>> {
  const preferred = getModel()
  const order = modelOrder(preferred)
  let firstRateLimitError: unknown = null

  for (const model of order) {
    try {
      const result = await callGeminiRaw(model, params)
      recordUsage(`gemini:${model}`)
      return result
    } catch (err) {
      const isRateLimited = err instanceof GeminiError && err.status === 429
      if (!isRateLimited) throw err
      // The request still reached the API and still counted against the day.
      recordUsage(`gemini:${model}`)
      markExhausted(model)
      firstRateLimitError ??= err
    }
  }

  // Every model is spent. The first error is the most relevant one: it names
  // the model the user actually chose.
  throw firstRateLimitError
}

async function callGeminiRaw(
  model: string,
  params: { systemPrompt: string; parts: GeminiPart[]; responseSchema: object },
): Promise<Record<string, unknown>> {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new GeminiError('Kein API-Key hinterlegt. Bitte in den Einstellungen eintragen.')
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: params.parts }],
        systemInstruction: { parts: [{ text: params.systemPrompt }] },
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: params.responseSchema,
        },
      }),
    })
  } catch {
    throw new GeminiError('Netzwerkfehler beim Aufruf der Gemini-API. Prüfe deine Internetverbindung.')
  }

  if (!response.ok) {
    let message = `Gemini-API-Fehler (${response.status})`
    try {
      const errBody = (await response.json()) as GeminiResponse
      if (errBody?.error?.message) message = errBody.error.message
    } catch {
      // ignore parse failure, keep generic message
    }
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      message = 'API-Key ungültig oder nicht berechtigt. Bitte in den Einstellungen prüfen.'
    } else if (response.status === 429) {
      message =
        'Kostenloses Kontingent gerade ausgeschöpft (Rate-Limit). Das kann eine kurze Sperre von wenigen Sekunden sein — oder das tägliche Gratis-Kontingent für dieses Modell ist für heute aufgebraucht. Prüfe ggf. dein Kontingent in Google AI Studio, oder versuche es später/morgen erneut.'
    }
    throw new GeminiError(message, response.status)
  }

  const data = (await response.json()) as GeminiResponse

  if (data.promptFeedback?.blockReason) {
    throw new GeminiError(`Anfrage blockiert (${data.promptFeedback.blockReason}). Bitte Beschreibung/Foto anpassen.`)
  }

  const text = data.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text
  if (!text) {
    throw new GeminiError('Gemini hat keine Antwort geliefert. Bitte erneut versuchen.')
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new GeminiError('Gemini-Antwort war kein gültiges JSON. Bitte erneut versuchen.')
  }
}

export async function estimateNutrition(params: {
  description: string
  photoDataUrl?: string
}): Promise<NutritionEstimate> {
  const parts: GeminiPart[] = []

  if (params.photoDataUrl) {
    const match = params.photoDataUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (match) {
      const [, mimeType, base64Data] = match
      parts.push({ inline_data: { mime_type: mimeType, data: base64Data } })
    }
  }

  parts.push({
    text: params.description.trim()
      ? `Beschreibung der Mahlzeit: ${params.description.trim()}`
      : 'Schätze die Nährwerte anhand des Fotos.',
  })

  const groundingContext = await buildGroundingContext(params.description)
  if (groundingContext) parts.push({ text: groundingContext })

  const parsed = await callGemini({
    systemPrompt: SYSTEM_PROMPT,
    parts,
    responseSchema: NUTRITION_RESPONSE_SCHEMA,
  })

  const rawIngredients = Array.isArray(parsed.ingredients) ? parsed.ingredients : []
  const ingredients: IngredientEstimate[] = rawIngredients.map((i) => ({
    name: String(i.name ?? 'Zutat'),
    amount: round1(Number(i.amount) || 0),
    unit: String(i.unit ?? ''),
    kcal: round1(Number(i.kcal) || 0),
    protein: round1(Number(i.protein) || 0),
    carbs: round1(Number(i.carbs) || 0),
    fat: round1(Number(i.fat) || 0),
    note: i.note ? String(i.note) : undefined,
  }))

  // Totals are always derived from the ingredient breakdown so the two never disagree.
  const totals = ingredients.reduce(
    (acc, i) => ({
      kcal: round1(acc.kcal + i.kcal),
      protein: round1(acc.protein + i.protein),
      carbs: round1(acc.carbs + i.carbs),
      fat: round1(acc.fat + i.fat),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )

  return {
    suggestedTitle: String(parsed.suggestedTitle ?? 'Mahlzeit'),
    ingredients,
    ...totals,
    note: parsed.note ? String(parsed.note) : undefined,
  }
}

/** Rounds to 1 decimal place — guards against floating-point artifacts like 38.300000000000004 from repeated addition. */
function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Turns a raw (often repetitive/messy) speech-to-text transcript into a
 * clean description text, without inventing or dropping any stated amount.
 */
export async function cleanUpDictation(rawText: string): Promise<string> {
  const parsed = await callGemini({
    systemPrompt: DICTATION_CLEANUP_SYSTEM_PROMPT,
    parts: [{ text: rawText }],
    responseSchema: DICTATION_CLEANUP_SCHEMA,
  })
  return String(parsed.cleanedText ?? rawText)
}

// --- Rezepte ---------------------------------------------------------------

export interface RecipeEstimate {
  suggestedTitle: string
  ingredients: IngredientEstimate[]
  /** Preparation steps, in order. */
  steps: string[]
  kcal: number
  protein: number
  carbs: number
  fat: number
  note?: string
}

const RECIPE_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    suggestedTitle: {
      type: 'STRING',
      description: 'Kurzer, prägnanter Titel für das Rezept auf Deutsch, z.B. "Nudeln mit Hackfleisch-Tomatensauce".',
    },
    ingredients: NUTRITION_RESPONSE_SCHEMA.properties.ingredients,
    steps: {
      type: 'ARRAY',
      description:
        'Zubereitungsschritte in sinnvoller, chronologischer Reihenfolge — jeder Schritt ein eigener, kurzer, klarer Satz auf Deutsch (z.B. "Nudeln in Salzwasser bissfest kochen."). Fasse zusammengehörige Handgriffe zu einem Schritt zusammen, statt jede Kleinigkeit einzeln aufzuführen.',
      items: { type: 'STRING' },
    },
    note: {
      type: 'STRING',
      description: 'NUR falls eine übergreifende Annahme zum gesamten Rezept nötig war — sonst weglassen.',
    },
  },
  required: ['suggestedTitle', 'ingredients', 'steps'],
}

const RECIPE_SYSTEM_PROMPT = `Du bist ein Ernährungsassistent. Der Nutzer beschreibt ein Rezept (Text) auf Deutsch, das er als Vorlage für zukünftige Mahlzeiten speichern möchte, ggf. mit ungefähren Mengenangaben in Gramm oder Haushaltsmaßen. Zerlege das Rezept in seine einzelnen Zutaten und schätze für JEDE Zutat einzeln die Nährwerte auf Basis üblicher Standard-Nährwerttabellen (wie z.B. USDA oder gängige Lebensmitteldatenbanken) für die im Rezept verwendete Menge (nicht pro 100g). "amount" muss diese Menge als reine Zahl enthalten (die Einheit kommt separat in "unit"), passend zu den angegebenen Nährwerten. Wenn Mengenangaben fehlen, nimm plausible durchschnittliche Mengen für eine Portion an. Schreibe eine "note" nur dort, wo wirklich eine relevante Annahme getroffen wurde — bei eindeutigen Zutaten bleibt "note" weg; betrifft eine Annahme eine EINZELNE Zutat, schreibe sie in die "note" dieser Zutat, niemals in die übergreifende "note". Strukturiere zusätzlich die Zubereitung in "steps": klare, sinnvoll geordnete Einzelschritte, jeder ein eigener kurzer Satz. Werden dir zusätzlich Referenz-Nährwerte aus einer Lebensmitteldatenbank mitgegeben, nutze diese bevorzugt für Zutaten, auf die sie wirklich zutreffen (auf die verwendete Menge skaliert). Antworte ausschließlich als JSON gemäß dem vorgegebenen Schema.`

export async function estimateRecipe(description: string): Promise<RecipeEstimate> {
  const parts: GeminiPart[] = [{ text: `Beschreibung des Rezepts: ${description.trim()}` }]

  const groundingContext = await buildGroundingContext(description)
  if (groundingContext) parts.push({ text: groundingContext })

  const parsed = await callGemini({
    systemPrompt: RECIPE_SYSTEM_PROMPT,
    parts,
    responseSchema: RECIPE_RESPONSE_SCHEMA,
  })

  const rawIngredients = Array.isArray(parsed.ingredients) ? parsed.ingredients : []
  const ingredients: IngredientEstimate[] = rawIngredients.map((i) => ({
    name: String(i.name ?? 'Zutat'),
    amount: round1(Number(i.amount) || 0),
    unit: String(i.unit ?? ''),
    kcal: round1(Number(i.kcal) || 0),
    protein: round1(Number(i.protein) || 0),
    carbs: round1(Number(i.carbs) || 0),
    fat: round1(Number(i.fat) || 0),
    note: i.note ? String(i.note) : undefined,
  }))

  const totals = ingredients.reduce(
    (acc, i) => ({
      kcal: round1(acc.kcal + i.kcal),
      protein: round1(acc.protein + i.protein),
      carbs: round1(acc.carbs + i.carbs),
      fat: round1(acc.fat + i.fat),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )

  const rawSteps = Array.isArray(parsed.steps) ? parsed.steps : []
  const steps = rawSteps.map((s) => String(s)).filter((s) => s.trim().length > 0)

  return {
    suggestedTitle: String(parsed.suggestedTitle ?? 'Rezept'),
    ingredients,
    steps,
    ...totals,
    note: parsed.note ? String(parsed.note) : undefined,
  }
}

// --- "Zutat +" — manuell eine einzelne Zutat hinzufügen, KI schätzt die Nährwerte ------

export interface SingleIngredientEstimate {
  name: string
  amount: number
  unit: string
  kcal: number
  protein: number
  carbs: number
  fat: number
  note?: string
}

const SINGLE_INGREDIENT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING', description: 'Bereinigter Name der Zutat, z.B. "Feta".' },
    amount: {
      type: 'NUMBER',
      description: 'Numerische Menge, passend zu den unten angegebenen Nährwerten — z.B. 100, nicht "100g" als Text.',
    },
    unit: { type: 'STRING', description: 'Kurze Einheit zu "amount", z.B. "g", "ml", "Stück", "EL", "TL".' },
    kcal: { type: 'NUMBER', description: 'Kalorien dieser Zutat in der angegebenen Menge.' },
    protein: { type: 'NUMBER', description: 'Protein dieser Zutat in Gramm.' },
    carbs: { type: 'NUMBER', description: 'Kohlenhydrate dieser Zutat in Gramm.' },
    fat: { type: 'NUMBER', description: 'Fett dieser Zutat in Gramm.' },
    note: {
      type: 'STRING',
      description: 'NUR falls für diese Zutat eine Annahme nötig war (z.B. Menge nicht angegeben) — sonst weglassen.',
    },
  },
  required: ['name', 'amount', 'unit', 'kcal', 'protein', 'carbs', 'fat'],
}

const SINGLE_INGREDIENT_SYSTEM_PROMPT = `Du bist ein Ernährungsassistent. Der Nutzer gibt eine einzelne Zutat mit Menge an (z.B. "150g Feta" oder "2 Eier"), die er manuell zu einem Rezept oder einer Mahlzeit hinzufügt. Schätze die Nährwerte GENAU dieser Zutat für die angegebene Menge auf Basis üblicher Standard-Nährwerttabellen. Wurde keine Menge angegeben, nimm eine plausible Standardmenge/-einheit an und vermerke dies in "note". Werden dir zusätzlich Referenz-Nährwerte aus einer Lebensmitteldatenbank mitgegeben, die zu dieser Zutat passen, nutze diese bevorzugt (auf die angegebene Menge skaliert). Antworte ausschließlich als JSON gemäß dem vorgegebenen Schema.`

/** Estimates nutrition for one free-text ingredient (e.g. "150g Feta") — used by the recipe editor's "Zutat +" button to add an ingredient the AI didn't already include. */
export async function estimateSingleIngredient(input: string): Promise<SingleIngredientEstimate> {
  const parts: GeminiPart[] = [{ text: input.trim() }]

  const groundingContext = await buildGroundingContext(input)
  if (groundingContext) parts.push({ text: groundingContext })

  const parsed = await callGemini({
    systemPrompt: SINGLE_INGREDIENT_SYSTEM_PROMPT,
    parts,
    responseSchema: SINGLE_INGREDIENT_SCHEMA,
  })

  return {
    name: String(parsed.name ?? input.trim()),
    amount: round1(Number(parsed.amount) || 0),
    unit: String(parsed.unit ?? ''),
    kcal: round1(Number(parsed.kcal) || 0),
    protein: round1(Number(parsed.protein) || 0),
    carbs: round1(Number(parsed.carbs) || 0),
    fat: round1(Number(parsed.fat) || 0),
    note: parsed.note ? String(parsed.note) : undefined,
  }
}

// --- Supplements -------------------------------------------------------

const SUPPLEMENT_TIME_ENUM: SupplementTimeOfDay[] = ['morning', 'noon', 'evening', 'night']
// Must stay in step with SupplementCategory in db.ts: this feeds both the
// response schema and the validation below, so a category missing here can
// never be produced — it silently collapses to general_health, filing e.g. a
// joint supplement where the user will not find it in the catalog.
const SUPPLEMENT_CATEGORY_ENUM: SupplementCategory[] = [
  'build_muscle',
  'endurance',
  'recovery',
  'joints',
  'immune',
  'cognition',
  'gut',
  'general_health',
]

export interface SupplementRecommendationInput {
  /** German label of the user's body goal, e.g. "Muskelaufbau" — as freeform text so this file stays decoupled from lib/bodyProfile.ts. */
  goalLabel: string
  /** Computed daily targets, or null if no body profile is set yet. */
  dailyTargets: { kcal: number; protein: number; carbs: number; fat: number } | null
  /** Actual average daily intake over the analyzed period, from logged meals. */
  averageIntake: { kcal: number; protein: number; carbs: number; fat: number }
  /** How many days averageIntake covers — gives the model honest context on how much signal it actually has. */
  periodDays: number
  /** Taken on almost every day of the last month — settled routine, nothing left to advise. */
  established: string[]
  /** On the list but taken patchily. These need a consistency nudge, not a new product. */
  irregular: { name: string; daysTaken: number; daysTracked: number }[]
  /** The previous run's suggestions with their wording, so unchanged circumstances produce unchanged advice. */
  previous: { supplementName: string; reasoning: string }[] | null
  /** Plain-language summary of how the nutrition data moved since that previous run, or null if nothing material changed. */
  nutritionChange: string | null
}

export type { SupplementRecommendation } from './db'

const SUPPLEMENT_RECOMMENDATION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    suggestions: {
      type: 'ARRAY',
      description:
        'So viele Vorschläge wie sachlich begründet sind — keine Ober- oder Untergrenze. Ist nur eines nötig, nenne genau eines; sind zehn nötig, nenne zehn. Erfinde nichts hinzu, um eine Liste zu füllen.',
      items: {
        type: 'OBJECT',
        properties: {
          supplementName: {
            type: 'STRING',
            description: 'Name des Supplements auf Deutsch, z.B. "Kreatin (Monohydrat)" oder "Omega-3".',
          },
          category: {
            type: 'STRING',
            enum: SUPPLEMENT_CATEGORY_ENUM,
            description:
              'build_muscle = Muskelaufbau & Kraft, endurance = Ausdauer & Leistung, recovery = Erholung & Schlaf, joints = Gelenke & Knochen, immune = Immunsystem, cognition = Fokus & Kognition, gut = Darm & Verdauung, general_health = Vitamine & Grundversorgung.',
          },
          suggestedDosage: {
            type: 'STRING',
            description: 'Übliche Dosierung als Text in einer allgemein anerkannten Spanne, z.B. "3–5 g täglich" — keine individuell-medizinische Dosierungsempfehlung.',
          },
          suggestedTimesOfDay: {
            type: 'ARRAY',
            items: { type: 'STRING', enum: SUPPLEMENT_TIME_ENUM },
            description: 'Zu welcher/n Tageszeit(en) dieses Supplement üblicherweise eingenommen wird — meist genau eine, bei mehrfach täglicher Einnahme auch mehrere.',
          },
          reasoning: {
            type: 'STRING',
            description:
              'Kurze, konkrete Begründung auf Deutsch (1-3 Sätze) — soweit möglich mit Bezug auf die tatsächlichen Nährwertdaten des Nutzers (z.B. eine erkennbare Lücke), sonst auf das Körperziel gestützt.',
          },
          kind: {
            type: 'STRING',
            enum: ['new', 'consistency'],
            description:
              'new = steht noch nicht auf der Liste. consistency = steht schon auf der Liste, wird aber zu unregelmäßig eingenommen; die Empfehlung lautet dann, es regelmäßig zu nehmen.',
          },
        },
        required: ['supplementName', 'category', 'suggestedDosage', 'suggestedTimesOfDay', 'reasoning', 'kind'],
      },
    },
  },
  required: ['suggestions'],
}

const SUPPLEMENT_RECOMMENDATION_SYSTEM_PROMPT = `Du bist ein Ernährungsassistent, der Nahrungsergänzungsmittel (Supplements) vorschlägt. Du bekommst das Körperziel des Nutzers, seine tatsächlichen Ernährungsdaten der letzten Zeit (Ziel- vs. Ist-Werte), seine bisherige Supplement-Einnahme und — falls vorhanden — deine eigenen Vorschläge vom letzten Mal.

WICHTIGSTE REGEL — Konsistenz: Deine Vorschläge sollen sich nicht von Tag zu Tag ohne Grund ändern. Wenn dir frühere Vorschläge vorliegen und sich an den Ernährungsdaten nichts Wesentliches geändert hat, übernimm dieselben Supplements mit im Kern derselben Begründung. Formuliere sie nicht ohne Anlass neu und tausche sie nicht gegen andere aus. Ändere einen Vorschlag nur, wenn die Daten es hergeben:
- Hat sich der Bedarf erhöht (z.B. Proteinlücke deutlich größer geworden), benenne das ausdrücklich in der Begründung.
- Hat er sich verringert, benenne auch das — und lass den Vorschlag weg, wenn er dadurch hinfällig wird.
- Ist ein früher vorgeschlagenes Supplement inzwischen regelmäßig in Einnahme, schlage es nicht erneut vor.

Anzahl: Nenne genau so viele Vorschläge, wie sachlich begründet sind. Es gibt keine Mindest- oder Höchstzahl. Ein einziger gut begründeter Vorschlag ist besser als fünf beliebige; sind aufgrund der Ernährungslage viele sinnvoll, nenne auch viele.

Bereits eingenommene Supplements:
- Was regelmäßig (an fast allen Tagen des letzten Monats) eingenommen wird, ist erledigt — schlage es nicht erneut vor.
- Was auf der Liste steht, aber unregelmäßig eingenommen wird, nimm mit kind="consistency" auf: die Empfehlung ist dann nicht ein neues Produkt, sondern die regelmäßige Einnahme des vorhandenen. Nenne in der Begründung konkret, an wie vielen Tagen es genommen wurde, und wofür die Regelmäßigkeit nötig ist (z.B. Kreatin wirkt nur bei täglicher Einnahme über Wochen).

Gewichte neue Vorschläge und Begründungen zu etwa drei Vierteln auf Basis der tatsächlichen Ernährungsdaten (z.B. "der Proteinbedarf wird im Schnitt um X g/Tag verfehlt" oder "kaum fettreicher Fisch/Omega-3-Quellen erkennbar") und zu einem Viertel auf Basis allgemein anerkannter, zum Körperziel passender Supplements auch ohne direkten Datenbezug (z.B. ist Kreatin bei Muskelaufbau generell gut belegt, unabhängig von den geloggten Mahlzeiten).

Bleibe bei allgemein anerkannten, gut belegten Supplements und breiten, üblichen Dosierungsspannen aus der Literatur — keine individuelle medizinische Beratung, keine ungewöhnlichen/riskanten Kombinationen oder Hochdosierungen. Antworte ausschließlich als JSON gemäß dem vorgegebenen Schema, auf Deutsch.`


/**
 * Generates 2–5 supplement suggestions grounded mostly in the user's actual
 * recent nutrition data (see the weighting instruction in the system
 * prompt above), refreshed only on explicit user request — never
 * auto-triggered on every meal save, both to respect the free API quota
 * and because a suggestion list that shuffles itself on its own would feel
 * less like a considered recommendation and more like noise.
 */
export async function estimateSupplementRecommendations(
  input: SupplementRecommendationInput,
): Promise<SupplementRecommendation[]> {
  const lines = [
    `Körperziel: ${input.goalLabel}`,
    input.dailyTargets
      ? `Tagesziel: ${Math.round(input.dailyTargets.kcal)} kcal, ${Math.round(input.dailyTargets.protein)}g Protein, ${Math.round(input.dailyTargets.carbs)}g Carbs, ${Math.round(input.dailyTargets.fat)}g Fett`
      : 'Kein Tagesziel hinterlegt (keine Körperwerte eingerichtet).',
    `Tatsächlicher Durchschnitt der letzten ${input.periodDays} Tage: ${Math.round(input.averageIntake.kcal)} kcal, ${Math.round(input.averageIntake.protein)}g Protein, ${Math.round(input.averageIntake.carbs)}g Carbs, ${Math.round(input.averageIntake.fat)}g Fett`,
    input.established.length > 0
      ? `Wird regelmäßig eingenommen (NICHT erneut vorschlagen): ${input.established.join(', ')}`
      : 'Kein Supplement wird derzeit regelmäßig eingenommen.',
    input.irregular.length > 0
      ? `Steht auf der Liste, wird aber unregelmäßig eingenommen (als kind="consistency" aufnehmen): ${input.irregular
          .map((i) => `${i.name} (an ${i.daysTaken} von ${i.daysTracked} Tagen)`)
          .join(', ')}`
      : 'Kein Supplement wird unregelmäßig eingenommen.',
  ]

  if (input.previous && input.previous.length > 0) {
    lines.push(
      '',
      'Deine Vorschläge vom letzten Mal — übernimm sie unverändert, solange die Daten keinen Anlass für eine Änderung geben:',
      ...input.previous.map((p) => `- ${p.supplementName}: ${p.reasoning}`),
      '',
      input.nutritionChange
        ? `Veränderung der Ernährungsdaten seitdem: ${input.nutritionChange}. Passe betroffene Vorschläge an und benenne die Veränderung in der Begründung.`
        : 'An den Ernährungsdaten hat sich seitdem nichts Wesentliches geändert — die Begründungen sollen daher inhaltlich gleich bleiben.',
    )
  }

  const parsed = await callGemini({
    systemPrompt: SUPPLEMENT_RECOMMENDATION_SYSTEM_PROMPT,
    parts: [{ text: lines.join('\n') }],
    responseSchema: SUPPLEMENT_RECOMMENDATION_SCHEMA,
  })

  const raw = Array.isArray(parsed.suggestions) ? parsed.suggestions : []
  return raw.map((s) => ({
    supplementName: String(s.supplementName ?? 'Supplement'),
    category: SUPPLEMENT_CATEGORY_ENUM.includes(s.category) ? s.category : 'general_health',
    suggestedDosage: String(s.suggestedDosage ?? ''),
    suggestedTimesOfDay: Array.isArray(s.suggestedTimesOfDay)
      ? s.suggestedTimesOfDay.filter((t: unknown): t is SupplementTimeOfDay => SUPPLEMENT_TIME_ENUM.includes(t as SupplementTimeOfDay))
      : [],
    reasoning: String(s.reasoning ?? ''),
    kind: s.kind === 'consistency' ? 'consistency' : 'new',
  }))
}

const SUPPLEMENT_TIMING_SCHEMA = {
  type: 'OBJECT',
  properties: {
    timesOfDay: {
      type: 'ARRAY',
      items: { type: 'STRING', enum: SUPPLEMENT_TIME_ENUM },
      description: 'Zu welcher/n Tageszeit(en) dieses Supplement üblicherweise eingenommen wird — meist genau eine.',
    },
  },
  required: ['timesOfDay'],
}

const SUPPLEMENT_TIMING_SYSTEM_PROMPT = `Du bist ein Ernährungsassistent. Der Nutzer nennt den Namen eines Nahrungsergänzungsmittels. Nenne, zu welcher/n Tageszeit(en) es laut allgemein üblicher Praxis sinnvollerweise eingenommen wird (z.B. Magnesium eher abends, Kreatin zu einer beliebigen aber täglich gleichen Zeit, Omega-3 zu einer Mahlzeit). Antworte ausschließlich als JSON gemäß dem vorgegebenen Schema.`

/**
 * Standalone timing suggestion for a supplement the user is adding
 * manually — independent of whether it was itself an AI suggestion. Doesn't
 * need any of the user's food data, just general knowledge about that one
 * supplement, so it's a much smaller/cheaper call than the full
 * recommendation pass above.
 */
export async function estimateSupplementTiming(supplementName: string): Promise<SupplementTimeOfDay[]> {
  const parsed = await callGemini({
    systemPrompt: SUPPLEMENT_TIMING_SYSTEM_PROMPT,
    parts: [{ text: supplementName.trim() }],
    responseSchema: SUPPLEMENT_TIMING_SCHEMA,
  })
  const raw = Array.isArray(parsed.timesOfDay) ? parsed.timesOfDay : []
  const times = raw.filter((t: unknown): t is SupplementTimeOfDay => SUPPLEMENT_TIME_ENUM.includes(t as SupplementTimeOfDay))
  return times.length > 0 ? times : ['morning']
}

// --- Rezept-Vorschläge --------------------------------------------------

const MEAL_TYPE_ENUM: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

export interface RecipeSuggestion {
  title: string
  category: MealType
  /** Short, concrete ingredients/preparation text — usable as-is as the recipe editor's input, ready for "Rezept schätzen". */
  description: string
  reasoning: string
}

const RECIPE_SUGGESTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    suggestions: {
      type: 'ARRAY',
      description: '2 bis 4 konkrete, unterschiedliche Rezept-Ideen, die zu den bisherigen Essgewohnheiten des Nutzers passen.',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: 'Kurzer, prägnanter Titel des Rezepts auf Deutsch.' },
          category: {
            type: 'STRING',
            enum: MEAL_TYPE_ENUM,
            description: 'Zu welcher Mahlzeitenkategorie das Rezept am besten passt.',
          },
          description: {
            type: 'STRING',
            description:
              'Kurze Beschreibung mit ungefähren Zutaten und Mengen auf Deutsch (2-4 Sätze), direkt geeignet als Ausgangstext für eine automatische Nährwert-Schätzung — z.B. "200g Hähnchenbrust, 150g Brokkoli, 100g Reis. Hähnchen anbraten, Brokkoli dämpfen, mit dem Reis servieren."',
          },
          reasoning: {
            type: 'STRING',
            description: 'Kurze Begründung auf Deutsch (1-2 Sätze), warum dieses Rezept zu den bisherigen Essgewohnheiten des Nutzers passt.',
          },
        },
        required: ['title', 'category', 'description', 'reasoning'],
      },
    },
  },
  required: ['suggestions'],
}

const RECIPE_SUGGESTION_SYSTEM_PROMPT = `Du bist ein Ernährungsassistent, der Rezept-Ideen vorschlägt. Du bekommst eine Liste der zuletzt vom Nutzer geloggten Mahlzeiten (Kategorie/Titel) sowie die Titel bereits gespeicherter Rezepte. Schlage 2 bis 4 konkrete Rezept-Ideen vor, die zu den erkennbaren Essgewohnheiten des Nutzers passen (wiederkehrende Zutaten, Küchenstil, übliche Mahlzeitengröße) — keine bloße Wiederholung einer bereits geloggten Mahlzeit, sondern sinnvolle, leicht abgewandelte oder ergänzende Ideen im selben Stil. Schlage keine Rezepte vor, deren Titel bereits gespeicherten Rezepten sehr ähnlich sind. Die "description" muss eine kurze, konkrete Zutaten-/Zubereitungsbeschreibung sein, die sich direkt automatisch schätzen lässt, ähnlich wie ein Nutzer sie selbst eintippen würde — keine vage Umschreibung. Antworte ausschließlich als JSON gemäß dem vorgegebenen Schema, auf Deutsch.`

/**
 * Generates 2–4 recipe ideas grounded in the user's recently logged meals,
 * refreshed only on explicit user request (same reasoning as the supplement
 * suggestions above: respects the free API quota, and a list that reshuffles
 * itself on its own would read as noise, not a considered recommendation).
 * Each suggestion's `description` is meant to be dropped straight into the
 * recipe editor's input step so the user's existing, trusted "Rezept
 * schätzen" flow produces the structured ingredients/steps — this call only
 * proposes the idea, it never invents nutrition numbers itself.
 */
export async function estimateRecipeSuggestions(input: {
  recentMealSummaries: string[]
  existingRecipeTitles: string[]
}): Promise<RecipeSuggestion[]> {
  const lines = [
    input.recentMealSummaries.length > 0
      ? `Zuletzt geloggte Mahlzeiten:\n${input.recentMealSummaries.map((s) => `- ${s}`).join('\n')}`
      : 'Der Nutzer hat noch keine Mahlzeiten geloggt.',
    input.existingRecipeTitles.length > 0
      ? `Bereits gespeicherte Rezepte (nicht erneut vorschlagen): ${input.existingRecipeTitles.join(', ')}`
      : 'Der Nutzer hat noch keine Rezepte gespeichert.',
  ]

  const parsed = await callGemini({
    systemPrompt: RECIPE_SUGGESTION_SYSTEM_PROMPT,
    parts: [{ text: lines.join('\n\n') }],
    responseSchema: RECIPE_SUGGESTION_SCHEMA,
  })

  const raw = Array.isArray(parsed.suggestions) ? parsed.suggestions : []
  return raw.map((s) => ({
    title: String(s.title ?? 'Rezept'),
    category: MEAL_TYPE_ENUM.includes(s.category) ? s.category : 'lunch',
    description: String(s.description ?? ''),
    reasoning: String(s.reasoning ?? ''),
  }))
}
