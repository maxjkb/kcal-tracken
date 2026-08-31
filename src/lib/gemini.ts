import { getApiKey } from './settings'
import { searchFoodDatabaseMany, type FoodDatabaseMatch } from './foodDatabase'
import {
  MICRONUTRIENT_ORDER,
  type MealType,
  type Micronutrients,
  type Nutrition,
  type SupplementCategory,
  type SupplementRecommendation,
  type SupplementTimeOfDay,
  type TipSuggestion,
} from './db'

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
  /**
   * The API's own wording, kept alongside the message shown to the user.
   *
   * `message` is deliberately replaced with German copy for the common
   * statuses, which threw away the only thing that distinguishes a spent daily
   * quota from a per-minute burst limit — both are 429, and both used to be
   * treated as "this model is done for today".
   */
  detail?: string

  constructor(message: string, status?: number, detail?: string) {
    super(message)
    this.name = 'GeminiError'
    this.status = status
    this.detail = detail
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
  micronutrients: Micronutrients
  note?: string
}

/**
 * Shared by meal- and recipe estimation. Unlike kcal/protein/carbs/fat,
 * micronutrients are estimated once for the WHOLE meal rather than derived
 * by summing a per-ingredient breakdown — there is no per-ingredient
 * micronutrient field, so asking for one here would just double the schema
 * for numbers nobody reads at that granularity. These are never shown to
 * the user as raw figures either; lib/micronutrients.ts turns a rolling
 * average of them into a "gut/durchschnittlich/unterrepräsentiert" band per
 * nutrient, which is the whole reason a rough per-meal estimate is good
 * enough here.
 */
const MICRONUTRIENT_SCHEMA = {
  type: 'OBJECT',
  description:
    'Grobe GESAMT-Schätzung der Mikronährstoffe der ganzen Mahlzeit (nicht pro Zutat) auf Basis üblicher Nährwerttabellen. Dient nur einem internen Grobabgleich mit dem Tagesbedarf über mehrere Tage gemittelt — wird dem Nutzer nie als exakte Zahl angezeigt, daher reicht eine realistische Schätzung ohne übertriebene Präzision.',
  properties: {
    vitaminD: { type: 'NUMBER', description: 'Vitamin D in µg.' },
    vitaminB12: { type: 'NUMBER', description: 'Vitamin B12 in µg.' },
    folate: { type: 'NUMBER', description: 'Folat (Vitamin B9) in µg.' },
    vitaminC: { type: 'NUMBER', description: 'Vitamin C in mg.' },
    calcium: { type: 'NUMBER', description: 'Calcium in mg.' },
    iron: { type: 'NUMBER', description: 'Eisen in mg.' },
    magnesium: { type: 'NUMBER', description: 'Magnesium in mg.' },
    zinc: { type: 'NUMBER', description: 'Zink in mg.' },
    potassium: { type: 'NUMBER', description: 'Kalium in mg.' },
    iodine: { type: 'NUMBER', description: 'Jod in µg.' },
  },
  required: ['vitaminD', 'vitaminB12', 'folate', 'vitaminC', 'calcium', 'iron', 'magnesium', 'zinc', 'potassium', 'iodine'],
}

function parseMicronutrients(raw: unknown): Micronutrients {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return Object.fromEntries(MICRONUTRIENT_ORDER.map((key) => [key, round1(Number(obj[key]) || 0)])) as Micronutrients
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
    micronutrients: MICRONUTRIENT_SCHEMA,
    note: {
      type: 'STRING',
      description: 'NUR falls eine übergreifende Annahme zur gesamten Mahlzeit nötig war — sonst weglassen.',
    },
  },
  required: ['suggestedTitle', 'ingredients', 'micronutrients'],
}

const SYSTEM_PROMPT = `Du bist ein Ernährungsassistent. Der Nutzer beschreibt eine Mahlzeit (Text und/oder Foto) auf Deutsch, ggf. mit ungefähren Mengenangaben in Gramm oder Haushaltsmaßen. Zerlege die Mahlzeit in ihre einzelnen Zutaten und schätze für JEDE Zutat einzeln die Nährwerte auf Basis üblicher Standard-Nährwerttabellen (wie z.B. USDA oder gängige Lebensmitteldatenbanken) für die TATSÄCHLICH VERZEHRTE Menge (nicht pro 100g). "amount" muss diese verzehrte Menge als reine Zahl enthalten (die Einheit kommt separat in "unit"), passend zu den angegebenen Nährwerten — wurde z.B. nur die Hälfte einer zubereiteten Soße gegessen, ist "amount" die gegessene Teilmenge, nicht die zubereitete Gesamtmenge. Wenn Mengenangaben fehlen, nimm plausible durchschnittliche Portionsgrößen an. Schätze zusätzlich in "micronutrients" GROB die Mikronährstoffe der GESAMTEN Mahlzeit (nicht pro Zutat) — diese dienen nur einem internen Abgleich über mehrere Tage gemittelt und werden nie als exakte Zahl angezeigt, eine realistische Schätzung reicht. Schreibe eine "note" nur dort, wo wirklich eine relevante Annahme getroffen wurde (z.B. "Nudeln ungekocht angenommen", "nur die Hälfte der zubereiteten Menge gegessen") — bei eindeutigen Zutaten bleibt "note" weg. Betrifft eine Annahme eine EINZELNE Zutat, schreibe sie IMMER in die "note" dieser Zutat, niemals in die übergreifende "note" der Mahlzeit — die übergreifende "note" ist ausschließlich für Annahmen reserviert, die sich nicht einer einzelnen Zutat zuordnen lassen. Werden dir zusätzlich Referenz-Nährwerte aus einer Lebensmitteldatenbank mitgegeben, nutze diese bevorzugt für Zutaten, auf die sie wirklich zutreffen (auf die verzehrte Menge skaliert) — ignoriere sie für Zutaten, auf die sie nicht passen. Antworte ausschließlich als JSON gemäß dem vorgegebenen Schema.`

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

const DICTATION_CLEANUP_SYSTEM_PROMPT = `Der Nutzer hat per Spracherkennung eine Mahlzeit beschrieben. Das Rohtranskript kann Wiederholungen, Versprecher, Füllwörter, abgebrochene Sätze (durch Sprechpausen bedingt) und vor allem Erkennungsfehler der Spracherkennung enthalten — Lebensmittel- und Mengenwörter werden von Spracherkennungs-Engines besonders häufig falsch verstanden (z. B. "Hafer Flocken" statt "Haferflocken", "200 g Reis" als "200 Kreis" erkannt, "Kichererbsen" als "Kirchererbsen", "Skyr" als "Schneier" oder "Sky Er").

Formuliere daraus einen klaren, kurzen, gut lesbaren Beschreibungstext auf Deutsch:
1. Korrigiere erkennbare Erkennungsfehler bei Lebensmitteln, Mengen und Einheiten aktiv, wenn aus dem Kontext eindeutig hervorgeht, was gemeint war — hier darfst und sollst du eingreifen, das ist der Hauptzweck dieser Bereinigung.
2. Füge KEINE Zutaten, Mengen oder Angaben hinzu, die im Transkript nicht in irgendeiner (auch fehlerhaften) Form vorkommen — korrigieren ja, erfinden nein.
3. Entferne Wiederholungen und Füllwörter ("äh", "also", "quasi").
4. Ist ein Satzteil erkennbar abgebrochen und ergibt für sich keinen Sinn (z. B. eine unvollständige Mengenangabe ohne zugehörige Zutat), lass ihn lieber weg als ihn zu erraten.
5. Bei tatsächlicher Unsicherheit (nicht bei offensichtlichen Erkennungsfehlern) im Zweifel näher am Original bleiben.

Antworte ausschließlich als JSON gemäß dem vorgegebenen Schema.`

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
/**
 * Distinguishes "you are out for today" from "you are going too fast".
 *
 * Google returns 429 for both, and only the message separates them. Anything
 * ambiguous is treated as the transient case: wrongly retiring a model costs
 * the user their chosen model for a whole day, while wrongly keeping it costs
 * one extra failed request.
 */
function isDailyQuotaError(err: GeminiError): boolean {
  const detail = (err.detail ?? '').toLowerCase()
  return /per ?day|daily|\/d\b/.test(detail)
}

/**
 * A failure that would answer identically no matter which model it's sent
 * to — trying the other two would just spend two more round trips to learn
 * the same thing, so this is the one case worth failing on immediately.
 */
function isKeyError(err: unknown): boolean {
  return err instanceof GeminiError && (err.status === 401 || err.status === 403)
}

async function callGemini(params: {
  systemPrompt: string
  parts: GeminiPart[]
  responseSchema: object
}): Promise<Record<string, unknown>> {
  const preferred = getModel()
  const order = modelOrder(preferred)
  let firstError: unknown = null

  for (const model of order) {
    try {
      const result = await callGeminiRaw(model, params)
      recordUsage(`gemini:${model}`)
      return result
    } catch (err) {
      firstError ??= err
      // A bad/unauthorized key fails the same way for every model — nothing
      // to gain from trying the rest.
      if (isKeyError(err)) throw err

      // Everything else falls through to the next model instead of failing
      // the whole request outright. This used to only happen for a 429 —
      // but a model that's since been renamed or retired answers 404, a
      // transient outage answers 5xx, and a dropped connection throws with
      // no status at all, and none of those say anything about whether the
      // *other* two models would work. A preferred model stored in
      // localStorage from before an app update, in particular, can 404
      // forever otherwise: previously that single stale id took the whole
      // feature down every single time, both for the manual retry button
      // and for the silent background refresh, even though the two
      // fallback models were perfectly healthy the whole time.
      if (err instanceof GeminiError && err.status === 429) {
        // The request still reached the API and still counted against the day.
        recordUsage(`gemini:${model}`)
        // Only a *daily* exhaustion retires a model. A 429 is also how a
        // per-minute burst limit answers — a few estimates in quick succession —
        // and treating that as a spent day demoted the user's chosen model until
        // midnight Pacific over a limit that cleared in seconds, with no way to
        // undo it. The other models are still tried either way; only the
        // remembering is conditional.
        if (isDailyQuotaError(err)) markExhausted(model)
      }
    }
  }

  // Every model failed. The first error is the most relevant one: it names
  // what happened with the model the user actually chose.
  throw firstError
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
    let detail = ''
    try {
      const errBody = (await response.json()) as GeminiResponse
      if (errBody?.error?.message) {
        message = errBody.error.message
        detail = errBody.error.message
      }
    } catch {
      // ignore parse failure, keep generic message
    }
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      message = 'API-Key ungültig oder nicht berechtigt. Bitte in den Einstellungen prüfen.'
    } else if (response.status === 429) {
      // Now that the two cases are told apart, say which one it is instead of
      // offering both possibilities and leaving the user to guess.
      message = /per ?day|daily|\/d\b/.test(detail.toLowerCase())
        ? 'Das tägliche Gratis-Kontingent für dieses Modell ist aufgebraucht. Die App wechselt automatisch auf ein anderes Modell; zurückgesetzt wird um Mitternacht pazifischer Zeit. Der Stand steht unter Einstellungen → Kontingent.'
        : 'Zu viele Anfragen in kurzer Zeit (Minutenlimit). Das löst sich meist nach wenigen Sekunden von selbst — die App versucht es direkt mit einem anderen Modell.'
    }
    throw new GeminiError(message, response.status, detail)
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
    micronutrients: parseMicronutrients(parsed.micronutrients),
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
  micronutrients: Micronutrients
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
    micronutrients: MICRONUTRIENT_SCHEMA,
    note: {
      type: 'STRING',
      description: 'NUR falls eine übergreifende Annahme zum gesamten Rezept nötig war — sonst weglassen.',
    },
  },
  required: ['suggestedTitle', 'ingredients', 'steps', 'micronutrients'],
}

const RECIPE_SYSTEM_PROMPT = `Du bist ein Ernährungsassistent. Der Nutzer beschreibt ein Rezept (Text) auf Deutsch, das er als Vorlage für zukünftige Mahlzeiten speichern möchte, ggf. mit ungefähren Mengenangaben in Gramm oder Haushaltsmaßen. Zerlege das Rezept in seine einzelnen Zutaten und schätze für JEDE Zutat einzeln die Nährwerte auf Basis üblicher Standard-Nährwerttabellen (wie z.B. USDA oder gängige Lebensmitteldatenbanken) für die im Rezept verwendete Menge (nicht pro 100g). "amount" muss diese Menge als reine Zahl enthalten (die Einheit kommt separat in "unit"), passend zu den angegebenen Nährwerten. Wenn Mengenangaben fehlen, nimm plausible durchschnittliche Mengen für eine Portion an. Schätze zusätzlich in "micronutrients" GROB die Mikronährstoffe des GESAMTEN Rezepts (nicht pro Zutat) — diese dienen nur einem internen Abgleich über mehrere Tage gemittelt und werden nie als exakte Zahl angezeigt, eine realistische Schätzung reicht. Schreibe eine "note" nur dort, wo wirklich eine relevante Annahme getroffen wurde — bei eindeutigen Zutaten bleibt "note" weg; betrifft eine Annahme eine EINZELNE Zutat, schreibe sie in die "note" dieser Zutat, niemals in die übergreifende "note". Strukturiere zusätzlich die Zubereitung in "steps": klare, sinnvoll geordnete Einzelschritte, jeder ein eigener kurzer Satz. Werden dir zusätzlich Referenz-Nährwerte aus einer Lebensmitteldatenbank mitgegeben, nutze diese bevorzugt für Zutaten, auf die sie wirklich zutreffen (auf die verwendete Menge skaliert). Antworte ausschließlich als JSON gemäß dem vorgegebenen Schema.`

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
    micronutrients: parseMicronutrients(parsed.micronutrients),
    note: parsed.note ? String(parsed.note) : undefined,
  }
}

// --- Mealprep — ein Rezept auf eine andere Menge skalieren ------------

export interface MealprepEstimate {
  ingredients: IngredientEstimate[]
  steps: string[]
  kcal: number
  protein: number
  carbs: number
  fat: number
  cookTimeNote: string
  storageNote: string
}

const MEALPREP_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    ingredients: NUTRITION_RESPONSE_SCHEMA.properties.ingredients,
    steps: {
      type: 'ARRAY',
      description:
        'Zubereitungsschritte für die NEUE Menge, in sinnvoller chronologischer Reihenfolge — nicht einfach dieselben Schritte des Original-Rezepts, sondern neu formuliert für die tatsächliche Menge und ggf. nötige Anpassungen (z.B. mehrere Durchgänge, größeres Gefäß, angepasste Reihenfolge beim Portionieren zum Aufbewahren). Jeder Schritt ein eigener, kurzer, klarer Satz auf Deutsch.',
      items: { type: 'STRING' },
    },
    cookTimeNote: {
      type: 'STRING',
      description:
        'Wie sich Koch-/Back-/Gardauer durch die neue Menge verändert, konkret in Worten (z.B. "Statt 15 Minuten eher 22–25 Minuten, da die größere Menge länger durcherhitzt." oder "Garzeit bleibt gleich, nur die Anbratzeit verlängert sich leicht."). Bei Verwendung eines Multikochers mit festem Fassungsvermögen (z.B. Thermomix, ca. 2,2 l/kg Maximalfüllung): weise ausdrücklich darauf hin, wenn die neue Menge das übersteigt und in mehreren Chargen zubereitet werden muss.',
    },
    storageNote: {
      type: 'STRING',
      description:
        'Konkrete Lagerungsempfehlung für die fertige Menge: wie viele Tage im Kühlschrank, ob und wie lange einfrierbar, kurzer Hinweis zum Aufwärmen. Auf Deutsch, 1-3 Sätze.',
    },
  },
  required: ['ingredients', 'steps', 'cookTimeNote', 'storageNote'],
}

const MEALPREP_SYSTEM_PROMPT = `Du bist ein erfahrener Koch, der Rezepte für Meal Prep (Vorkochen auf Vorrat) auf eine andere Menge skaliert. Du bekommst ein gespeichertes Original-Rezept (Zutaten mit Mengen und Nährwerten, Zubereitungsschritte) sowie eine Beschreibung der gewünschten neuen Menge (z.B. "6 Portionen", "doppelte Menge", "für die ganze Woche").

WICHTIGSTE REGEL — kein reiner Dreisatz: Skaliere NICHT jede Zutat stur mit demselben Faktor. Nutze kulinarischen Sachverstand:
- Gewürze, Salz, Kräuter und intensive Aromen (Chili, Knoblauch, Ingwer) wachsen unterproportional — bei doppelter Hauptmenge meist nur das 1,3- bis 1,6-fache, nicht das Doppelte. Weise in der jeweiligen Zutat-"note" auf "nach Geschmack nachjustieren" hin, wo das relevant ist.
- Öl/Fett zum Anbraten richtet sich eher nach der Pfannen-/Topffläche als nach der Menge und wächst daher meist unterproportional.
- Flüssigkeitsmengen bei Suppen, Saucen und Schmorgerichten an die tatsächlich benötigte Konsistenz anpassen, nicht stur linear hochrechnen.
- Backpulver, Hefe und andere Triebmittel bei starker Skalierung mit besonderer Vorsicht behandeln — hier kann reine Vervielfachung das Ergebnis verändern.
- Zutaten, die sich nicht sinnvoll teilweise verwenden lassen (z.B. 1 Ei, 1 Dose), auf eine praktikable ganze Menge runden und das in der "note" der Zutat erklären.

Passe die Zubereitungsschritte an die neue Menge an, nicht nur die Zahlen im selben Text: ein größeres Gefäß, eine andere Reihenfolge, oder — besonders bei einem Multikocher mit festem Kapazitätslimit — ausdrücklich mehrere Zubereitungsdurchgänge, wenn die neue Menge das Fassungsvermögen übersteigt.

Berechne für JEDE Zutat die Nährwerte für die NEUE Menge (nicht für die Original-Menge). "amount" ist die neue, tatsächlich benötigte Menge als reine Zahl. Gib in "cookTimeNote" konkret an, wie sich die Zeiten verändern, und in "storageNote" eine klare Lagerungsempfehlung für die fertige Menge. Antworte ausschließlich als JSON gemäß dem vorgegebenen Schema, auf Deutsch.`

export async function estimateMealprep(input: {
  recipeTitle: string
  originalIngredients: { name: string; amount: number; unit: string; kcal: number; protein: number; carbs: number; fat: number }[]
  originalSteps: string[]
  targetDescription: string
}): Promise<MealprepEstimate> {
  const lines = [
    `Original-Rezept: ${input.recipeTitle}`,
    'Original-Zutaten (Menge für die Original-Portion):',
    ...input.originalIngredients.map((i) => `- ${i.name}: ${i.amount} ${i.unit} (${Math.round(i.kcal)} kcal, ${Math.round(i.protein)}g Protein, ${Math.round(i.carbs)}g Carbs, ${Math.round(i.fat)}g Fett)`),
    'Original-Zubereitung:',
    ...input.originalSteps.map((s, i) => `${i + 1}. ${s}`),
    '',
    `Gewünschte neue Menge: ${input.targetDescription.trim()}`,
  ]

  const parsed = await callGemini({
    systemPrompt: MEALPREP_SYSTEM_PROMPT,
    parts: [{ text: lines.join('\n') }],
    responseSchema: MEALPREP_RESPONSE_SCHEMA,
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
    ingredients,
    steps,
    ...totals,
    cookTimeNote: String(parsed.cookTimeNote ?? ''),
    storageNote: String(parsed.storageNote ?? ''),
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
  /** Micronutrients (German labels) whose recency-weighted average sits in the "unterrepräsentiert" band — empty when there's no body profile or no such gap. */
  lowMicronutrients: string[]
  /** Active routine entries whose own contribution touches a micronutrient now in the "Überschuss" band (diet + this supplement together) — empty in the normal case where nothing is excessive. */
  excessSupplements: { name: string; nutrients: string[] }[]
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
            enum: ['new', 'consistency', 'no_longer_needed'],
            description:
              'new = steht noch nicht auf der Liste. consistency = steht schon auf der Liste, wird aber zu unregelmäßig eingenommen; die Empfehlung lautet dann, es regelmäßig zu nehmen. no_longer_needed = steht auf der Liste UND in "Mögliche Überschüsse" (siehe unten) — die Begründung erklärt konkret, warum, und ob eher ganz absetzen oder nur die Dosis senken sinnvoll ist.',
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

Mögliche Überschüsse: Du bekommst ggf. eine Liste aktiver Supplements, deren eigener Beitrag (zusammen mit der Ernährung) einen Mikronährstoff inzwischen weit über den Referenzwert treibt ("Überschuss"-Band). Prüfe für JEDEN Eintrag dieser Liste eigenständig, ob ein Vorschlag mit kind="no_longer_needed" gerechtfertigt ist:
- Ist der Überschuss wirklich auf DIESES Supplement zurückzuführen und gibt es keinen erkennbaren anderen Grund, es trotzdem in dieser Dosis fortzuführen, schlage kind="no_longer_needed" vor. Sag in der Begründung konkret, welcher Nährstoff betroffen ist und ob eher ganz absetzen oder nur die Dosis reduzieren sinnvoll ist.
- Erscheint der Überschuss unbedenklich oder ist das Supplement aus anderen Gründen (z.B. Körperziel) weiter sinnvoll, mach dazu KEINEN Vorschlag — nicht jeder Eintrag dieser Liste braucht eine Reaktion.
- Ein Supplement aus dieser Liste taucht niemals gleichzeitig als "consistency"-Vorschlag auf — beides widerspricht sich.

Gewichte neue Vorschläge und Begründungen zu etwa drei Vierteln auf Basis der tatsächlichen Ernährungsdaten (z.B. "der Proteinbedarf wird im Schnitt um X g/Tag verfehlt", "kaum fettreicher Fisch/Omega-3-Quellen erkennbar", oder ein gemeldeter Mikronährstoff-Mangel) und zu einem Viertel auf Basis allgemein anerkannter, zum Körperziel passender Supplements auch ohne direkten Datenbezug (z.B. ist Kreatin bei Muskelaufbau generell gut belegt, unabhängig von den geloggten Mahlzeiten). Ein gemeldeter Mikronährstoff-Mangel (gewichteter Langzeit-Schnitt unter Referenzwert) ist ein eigenständiger, direkter Grund für einen Vorschlag — z.B. rechtfertigt "Vitamin D unterrepräsentiert" für sich allein einen Vitamin-D-Vorschlag, auch ohne dass sich das an den Makronährstoffen zeigt.

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
    input.lowMicronutrients.length > 0
      ? `Mikronährstoffe mit erkennbarem Mangel (gewichteter Langzeit-Schnitt unter Referenzwert, grobe KI-Schätzung): ${input.lowMicronutrients.join(', ')}`
      : 'Keine erkennbare Mikronährstoff-Lücke (oder noch keine ausreichenden Daten dafür).',
    input.excessSupplements.length > 0
      ? `Mögliche Überschüsse — aktive Supplements, deren eigener Beitrag einen Mikronährstoff jetzt weit über den Referenzwert treibt (für jedes eigenständig prüfen, ob kind="no_longer_needed" gerechtfertigt ist): ${input.excessSupplements
          .map((e) => `${e.name} (betrifft: ${e.nutrients.join(', ')})`)
          .join('; ')}`
      : 'Kein aktives Supplement treibt derzeit einen Mikronährstoff in den Überschuss.',
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
  /** 'familiar' builds on ingredients/style the user already eats often; 'new' is a deliberately unfamiliar idea to try — see the system prompt's mixing instruction. */
  novelty: 'familiar' | 'new'
}

const NOVELTY_ENUM = ['familiar', 'new'] as const

const RECIPE_SUGGESTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    suggestions: {
      type: 'ARRAY',
      description: '2 bis 4 konkrete, unterschiedliche Rezept-Ideen — siehe Systemanweisung für die geforderte Mischung aus vertraut und neu.',
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
            description:
              'Kurze Begründung auf Deutsch (1-2 Sätze) — bei novelty="familiar" der Bezug zu den gewohnten Zutaten/Essgewohnheiten, bei novelty="new" was daran bewusst neu/anders ist und warum es trotzdem passt (z.B. zu den offenen Tageszielen).',
          },
          novelty: {
            type: 'STRING',
            enum: NOVELTY_ENUM,
            description: '"familiar" = baut auf oft gegessenen Zutaten/dem gewohnten Küchenstil auf. "new" = bewusst eine unvertraute Idee, die NICHT am bisherigen Muster festhält.',
          },
        },
        required: ['title', 'category', 'description', 'reasoning', 'novelty'],
      },
    },
  },
  required: ['suggestions'],
}

const RECIPE_SUGGESTION_SYSTEM_PROMPT = `Du bist ein Ernährungsassistent, der Rezept-Ideen vorschlägt. Du bekommst: die aktuelle Tageszeit-Kategorie, die noch offenen Tagesziele (Rest-Kalorien/-Makros bis zum Tagesziel, falls Körperwerte hinterlegt sind), eine Liste häufig verwendeter Zutaten aus der Koch-/Ess-Historie, die zuletzt geloggten Mahlzeiten sowie die Titel bereits gespeicherter Rezepte.

Tageszeit: die meisten Vorschläge sollen zur genannten Kategorie passen (z.B. abends keine Frühstücksideen), da der Nutzer JETZT zu dieser Tageszeit ein Rezept sucht.

Offene Tagesziele: sind sie angegeben, richte die Rezepte darauf aus, was NOCH gebraucht wird — ist z.B. der Proteinbedarf für heute noch weit offen, aber Kohlenhydrate schon fast ausgeschöpft, bevorzuge proteinreiche, kohlenhydratärmere Ideen. Ist kein Tagesziel angegeben, ignoriere diesen Punkt.

WICHTIGSTE REGEL — bewusste Mischung: Von den vorgeschlagenen Rezepten muss MINDESTENS EINES novelty="new" sein — eine Idee, die bewusst NICHT einfach die häufigen Zutaten oder den gewohnten Küchenstil wiederholt, sondern etwas, das der Nutzer erkennbar noch nicht ausprobiert hat, aber dennoch zu den offenen Tageszielen bzw. zur Tageszeit passt. Die übrigen sind novelty="familiar": sie dürfen auf den häufigen Zutaten und dem gewohnten Stil aufbauen — keine bloße Wiederholung einer bereits geloggten Mahlzeit, sondern eine sinnvolle, leicht abgewandelte oder ergänzende Idee im selben Stil.

Schlage keine Rezepte vor, deren Titel bereits gespeicherten Rezepten sehr ähnlich sind. Die "description" muss eine kurze, konkrete Zutaten-/Zubereitungsbeschreibung sein, die sich direkt automatisch schätzen lässt, ähnlich wie ein Nutzer sie selbst eintippen würde — keine vage Umschreibung. Antworte ausschließlich als JSON gemäß dem vorgegebenen Schema, auf Deutsch.`

/**
 * Generates 2–4 recipe ideas, refreshed only on explicit user request (same
 * reasoning as the supplement suggestions above: respects the free API
 * quota, and a list that reshuffles itself on its own would read as noise,
 * not a considered recommendation). Each suggestion's `description` is
 * meant to be dropped straight into the recipe editor's input step so the
 * user's existing, trusted "Rezept schätzen" flow produces the structured
 * ingredients/steps — this call only proposes the idea, it never invents
 * nutrition numbers itself.
 *
 * Grounded in three signals beyond the recent-meals/existing-recipes list
 * this already had: the current meal-type/time-of-day slot (same cadence
 * guessMealType() drives elsewhere — a suggestion pass run at 8pm should
 * offer dinner ideas, not breakfast ones), today's still-open macro targets
 * (so a suggestion can actually close today's gap instead of ignoring it),
 * and ingredients that show up often across the user's own cooking history
 * (see rankFrequentIngredients) — deliberately mixed with at least one
 * suggestion that's NOT just more of the same, per the system prompt's
 * explicit novelty requirement.
 */
export async function estimateRecipeSuggestions(input: {
  recentMealSummaries: string[]
  existingRecipeTitles: string[]
  currentSlotLabel: string
  /** Computed daily targets, or null if no body profile is set yet. */
  dailyTargets: { kcal: number; protein: number; carbs: number; fat: number } | null
  /** What's already been eaten today, to reason about what's still open. */
  consumedToday: { kcal: number; protein: number; carbs: number; fat: number }
  frequentIngredients: string[]
}): Promise<RecipeSuggestion[]> {
  const lines = [
    `Aktuelle Tageszeit-Kategorie: ${input.currentSlotLabel}`,
    input.dailyTargets
      ? `Tagesziel: ${Math.round(input.dailyTargets.kcal)} kcal, ${Math.round(input.dailyTargets.protein)}g Protein, ${Math.round(input.dailyTargets.carbs)}g Carbs, ${Math.round(input.dailyTargets.fat)}g Fett. Bisher heute gegessen: ${Math.round(input.consumedToday.kcal)} kcal, ${Math.round(input.consumedToday.protein)}g Protein, ${Math.round(input.consumedToday.carbs)}g Carbs, ${Math.round(input.consumedToday.fat)}g Fett.`
      : 'Kein Tagesziel hinterlegt (keine Körperwerte eingerichtet) — Tagesziele bei den Vorschlägen ignorieren.',
    input.frequentIngredients.length > 0
      ? `Häufig verwendete Zutaten aus der Historie: ${input.frequentIngredients.join(', ')}`
      : 'Noch keine ausreichende Zutaten-Historie vorhanden.',
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
    novelty: NOVELTY_ENUM.includes(s.novelty) ? s.novelty : 'familiar',
  }))
}

// --- Tipps für jetzt ------------------------------------------------------

export type { TipSuggestion } from './db'

const TIP_FOCUS_ENUM = ['kcal', 'protein', 'carbs', 'fat', 'general'] as const

const NUTRITION_TIPS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    tips: {
      type: 'ARRAY',
      description:
        '2 bis 3 kurze, konkrete Tipps, was der Nutzer als Nächstes essen könnte. Lieber ein einziger wirklich passender Tipp als mehrere beliebige — ist die Ernährung des Tages bereits ausgewogen, ist auch eine leere Liste richtig.',
      items: {
        type: 'OBJECT',
        properties: {
          focus: {
            type: 'STRING',
            enum: TIP_FOCUS_ENUM,
            description: 'Welche Lücke dieser Tipp schließt. "general" nur für Hinweise ohne klaren Makro-Bezug (z.B. Timing, Flüssigkeit).',
          },
          suggestion: {
            type: 'STRING',
            description:
              'Kurzer, konkreter Vorschlag mit 2-4 tatsächlichen Lebensmitteln/Zutatenkategorien, z.B. "Thunfisch, Hähnchenbrust oder Hüttenkäse" oder "2 gekochte Eier" — KEIN vollständiges Rezept, keine Zubereitungsschritte.',
          },
          reason: {
            type: 'STRING',
            description: 'Ein kurzer Satz, warum das jetzt passt (z.B. verbleibende Lücke, Tageszeit).',
          },
        },
        required: ['focus', 'suggestion', 'reason'],
      },
    },
  },
  required: ['tips'],
}

const NUTRITION_TIPS_SYSTEM_PROMPT = `Du bist ein Ernährungsassistent. Der Nutzer bekommt "Was jetzt essen"-Tipps angezeigt: kurze, konkrete Vorschläge für Lebensmittel/Zutatenkategorien (keine vollständigen Rezepte), die die noch offenen Tagesziele sinnvoll füllen — passend zur aktuellen Tageszeit.

Du bekommst: die aktuelle Tageszeit-Phase (Frühstück/Mittagessen/Nachmittags-Snack/Abendessen), die Tagesziele (kcal/Protein/Kohlenhydrate/Fett), was davon heute schon gegessen wurde, sowie die Titel der heute bereits geloggten Mahlzeiten.

Regeln:
- Rechne die verbleibende Lücke je Makro selbst aus (Ziel minus bereits Gegessenes) und richte die Tipps danach aus. Ist ein Makro schon erreicht oder überschritten, schlage dort nichts Zusätzliches vor.
- Passe die Tipps an die Tageszeit an: zur Frühstücks-/Mittags-/Abendzeit dürfen es auch zu dieser Mahlzeit passende Ideen sein, nicht nur einzelne Snacks. Snack-Ideen (schnell, ohne Zubereitung) sind dagegen zu JEDER Tageszeit passend und dürfen jederzeit dabei sein.
- Schlage nichts vor, das laut den bereits geloggten Mahlzeiten-Titeln erkennbar schon gegessen wurde.
- Nenne konkrete Lebensmittel oder kurze Kombinationen, keine vollständigen Rezepte mit Zubereitungsschritten — das hier ist "was jetzt greifen", nicht "was kochen".
- Ist die Ernährung des Tages bereits ausgewogen bzw. gibt es keine sinnvolle Lücke mehr, gib eine leere "tips"-Liste zurück statt beliebige Tipps zu erfinden.
- Halte jeden Tipp kurz (ein Satz Vorschlag, ein Satz Begründung).

Antworte ausschließlich als JSON gemäß dem vorgegebenen Schema, auf Deutsch.`

export interface NutritionTipsInput {
  /** German label of the current time-of-day slot, e.g. "Frühstück" — freeform text so this file stays decoupled from lib/db.ts's MealType labels. */
  slotLabel: string
  dailyTargets: Nutrition | null
  consumedSoFar: Nutrition
  /** Titles of meals already logged today, so the model doesn't suggest something already eaten. */
  loggedTitles: string[]
}

/**
 * Generates 0–3 short "what to eat next" tips grounded in today's actual
 * remaining macro gaps and the current time-of-day slot — food categories,
 * not recipes. Refreshed per time-of-day slot rather than once a day (see
 * lib/tips.ts), since the whole point is that a breakfast-time gap doesn't
 * still get suggested at dinner.
 */
export async function estimateNutritionTips(input: NutritionTipsInput): Promise<TipSuggestion[]> {
  const lines = [
    `Aktuelle Tageszeit-Phase: ${input.slotLabel}`,
    input.dailyTargets
      ? `Tagesziel: ${Math.round(input.dailyTargets.kcal)} kcal, ${Math.round(input.dailyTargets.protein)}g Protein, ${Math.round(input.dailyTargets.carbs)}g Kohlenhydrate, ${Math.round(input.dailyTargets.fat)}g Fett`
      : 'Kein Tagesziel hinterlegt (keine Körperwerte eingerichtet) — richte dich an allgemein üblichen Portionen aus.',
    `Bereits heute gegessen: ${Math.round(input.consumedSoFar.kcal)} kcal, ${Math.round(input.consumedSoFar.protein)}g Protein, ${Math.round(input.consumedSoFar.carbs)}g Kohlenhydrate, ${Math.round(input.consumedSoFar.fat)}g Fett`,
    input.loggedTitles.length > 0
      ? `Heute bereits geloggte Mahlzeiten: ${input.loggedTitles.join(', ')}`
      : 'Heute wurde noch nichts geloggt.',
  ]

  const parsed = await callGemini({
    systemPrompt: NUTRITION_TIPS_SYSTEM_PROMPT,
    parts: [{ text: lines.join('\n') }],
    responseSchema: NUTRITION_TIPS_SCHEMA,
  })

  const raw = Array.isArray(parsed.tips) ? parsed.tips : []
  return raw.map((t) => ({
    focus: TIP_FOCUS_ENUM.includes(t.focus) ? t.focus : 'general',
    suggestion: String(t.suggestion ?? ''),
    reason: String(t.reason ?? ''),
  }))
}

// --- Mikronährstoff-Backfill für bereits geloggte Mahlzeiten ---------------

export interface MicronutrientBackfillInput {
  id: string
  title: string
  description: string
}

const MICRONUTRIENT_BACKFILL_SCHEMA = {
  type: 'OBJECT',
  properties: {
    meals: {
      type: 'ARRAY',
      description: 'Eine Mikronährstoff-Schätzung für JEDE übergebene Mahlzeit, mit ihrer id.',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING', description: 'Die id der Mahlzeit, exakt wie übergeben.' },
          micronutrients: MICRONUTRIENT_SCHEMA,
        },
        required: ['id', 'micronutrients'],
      },
    },
  },
  required: ['meals'],
}

const MICRONUTRIENT_BACKFILL_SYSTEM_PROMPT = `Du bekommst eine Liste bereits in der Vergangenheit geloggter Mahlzeiten — jeweils nur Titel und ggf. eine kurze Beschreibung, keine Zutatenliste. Schätze für JEDE davon GROB die Mikronährstoffe der gesamten Mahlzeit anhand des Titels/der Beschreibung. Das sind nachträgliche Richtwerte für eine grobe statistische Einordnung, keine präzise Analyse — realistische Schätzungen reichen völlig, übertriebene Präzision ist nicht nötig und nicht möglich. Antworte für JEDE übergebene Mahlzeit mit ihrer id (exakt wie übergeben) — keine auslassen. Antworte ausschließlich als JSON gemäß dem vorgegebenen Schema.`

/**
 * Rough, cheap micronutrient estimates for meals logged before this feature
 * existed — title/description only, no photo, no grounding lookup, no
 * ingredient breakdown, and many meals per call (see
 * lib/micronutrients.ts's backfillMissingMicronutrients for the batching).
 * A full estimateNutrition-quality pass per historical meal would work too,
 * but at many times the quota cost for numbers that only ever feed a
 * recency-weighted band — the accuracy that buys is never visible.
 */
export async function estimateMicronutrientsBackfill(
  meals: MicronutrientBackfillInput[],
): Promise<Record<string, Micronutrients>> {
  const lines = meals.map((m) => `- id=${m.id}: "${m.title}"${m.description.trim() ? ` — ${m.description.trim()}` : ''}`)

  const parsed = await callGemini({
    systemPrompt: MICRONUTRIENT_BACKFILL_SYSTEM_PROMPT,
    parts: [{ text: lines.join('\n') }],
    responseSchema: MICRONUTRIENT_BACKFILL_SCHEMA,
  })

  const raw = Array.isArray(parsed.meals) ? parsed.meals : []
  const result: Record<string, Micronutrients> = {}
  for (const entry of raw) {
    if (typeof entry.id !== 'string') continue
    result[entry.id] = parseMicronutrients(entry.micronutrients)
  }
  return result
}

// --- Mikronährstoff-Beitrag eines eigenen Supplements ----------------------

const SUPPLEMENT_CONTRIBUTION_SYSTEM_PROMPT = `Du bekommst den Namen eines Nahrungsergänzungsmittels und die tatsächliche persönliche Dosierung, die der Nutzer davon einnimmt (nicht zwingend die Herstellerangabe). Schätze GROB, wie viel jeder der zehn folgenden Mikronährstoffe EINE VOLLE TAGESDOSIS bei dieser persönlichen Dosierung tatsächlich liefert, anhand allgemein bekannter Gehalte üblicher Präparate dieser Art. Liefert das Präparat einen Mikronährstoff nicht nennenswert (z.B. liefert reines Kreatin kein Vitamin D), setze ihn auf 0 — erfinde keinen Beitrag. Das sind grobe Richtwerte für einen internen Abgleich mit dem Tagesbedarf über mehrere Tage gemittelt, keine exakte Laboranalyse. Antworte ausschließlich als JSON gemäß dem vorgegebenen Schema.`

/**
 * How much one full daily dose of a user's own supplement (at their actual
 * personal dosage, not the catalog's generic typicalDosage) contributes to
 * each of the ten tracked micronutrients — reuses MICRONUTRIENT_SCHEMA/
 * parseMicronutrients, the exact same shape a meal's own estimate has, so
 * lib/micronutrients.ts can add the two together without a second code
 * path. Called once when a supplement is added or its dosage changes (see
 * useSupplements.ts) — best-effort, same as estimateMicronutrientsBackfill:
 * a failed or skipped call just leaves the entry without a contribution.
 */
export async function estimateSupplementContribution(name: string, dosage: string): Promise<Micronutrients> {
  const parsed = await callGemini({
    systemPrompt: SUPPLEMENT_CONTRIBUTION_SYSTEM_PROMPT,
    parts: [{ text: `Supplement: ${name}\nPersönliche Dosierung: ${dosage.trim() || 'keine Angabe, übliche Dosierung annehmen'}` }],
    responseSchema: MICRONUTRIENT_SCHEMA,
  })
  return parseMicronutrients(parsed)
}
