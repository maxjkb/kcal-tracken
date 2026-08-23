import { getApiKey } from './settings'

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
  amount: string
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
          amount: { type: 'STRING', description: 'Menge als lesbarer Text, z.B. "200 g" oder "1 Stück".' },
          kcal: { type: 'NUMBER', description: 'Kalorien dieser Zutat in der angegebenen Menge.' },
          protein: { type: 'NUMBER', description: 'Protein dieser Zutat in Gramm.' },
          carbs: { type: 'NUMBER', description: 'Kohlenhydrate dieser Zutat in Gramm.' },
          fat: { type: 'NUMBER', description: 'Fett dieser Zutat in Gramm.' },
          note: {
            type: 'STRING',
            description:
              'NUR falls für diese Zutat eine Annahme nötig war (z.B. roh/gekocht, Fettgehalt, Portionsgröße) — sonst weglassen.',
          },
        },
        required: ['name', 'amount', 'kcal', 'protein', 'carbs', 'fat'],
      },
    },
    note: {
      type: 'STRING',
      description: 'NUR falls eine übergreifende Annahme zur gesamten Mahlzeit nötig war — sonst weglassen.',
    },
  },
  required: ['suggestedTitle', 'ingredients'],
}

const SYSTEM_PROMPT = `Du bist ein Ernährungsassistent. Der Nutzer beschreibt eine Mahlzeit (Text und/oder Foto) auf Deutsch, ggf. mit ungefähren Mengenangaben in Gramm oder Haushaltsmaßen. Zerlege die Mahlzeit in ihre einzelnen Zutaten und schätze für JEDE Zutat einzeln die Nährwerte auf Basis üblicher Standard-Nährwerttabellen (wie z.B. USDA oder gängige Lebensmitteldatenbanken) für die tatsächlich verwendete Menge (nicht pro 100g). Wenn Mengenangaben fehlen, nimm plausible durchschnittliche Portionsgrößen an. Schreibe eine "note" nur dort, wo wirklich eine relevante Annahme getroffen wurde (z.B. "Nudeln ungekocht angenommen") — bei eindeutigen Zutaten bleibt "note" weg. Antworte ausschließlich als JSON gemäß dem vorgegebenen Schema.`

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
      message = 'Kostenloses Kontingent gerade ausgeschöpft (Rate-Limit). Bitte kurz warten und erneut versuchen.'
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

  const parsed = await callGemini({
    systemPrompt: SYSTEM_PROMPT,
    parts,
    responseSchema: NUTRITION_RESPONSE_SCHEMA,
  })

  const rawIngredients = Array.isArray(parsed.ingredients) ? parsed.ingredients : []
  const ingredients: IngredientEstimate[] = rawIngredients.map((i) => ({
    name: String(i.name ?? 'Zutat'),
    amount: String(i.amount ?? ''),
    kcal: Number(i.kcal) || 0,
    protein: Number(i.protein) || 0,
    carbs: Number(i.carbs) || 0,
    fat: Number(i.fat) || 0,
    note: i.note ? String(i.note) : undefined,
  }))

  // Totals are always derived from the ingredient breakdown so the two never disagree.
  const totals = ingredients.reduce(
    (acc, i) => ({
      kcal: acc.kcal + i.kcal,
      protein: acc.protein + i.protein,
      carbs: acc.carbs + i.carbs,
      fat: acc.fat + i.fat,
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
