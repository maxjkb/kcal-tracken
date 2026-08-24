import { getApiKey } from './settings'
import { searchFoodDatabaseMany, type FoodDatabaseMatch } from './foodDatabase'

const DEFAULT_MODEL = 'gemini-3.6-flash'
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

async function callGemini(params: {
  systemPrompt: string
  parts: GeminiPart[]
  responseSchema: object
}): Promise<Record<string, unknown>> {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new GeminiError('Kein API-Key hinterlegt. Bitte in den Einstellungen eintragen.')
  }

  const model = getModel()
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
