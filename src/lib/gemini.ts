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

export interface NutritionEstimate {
  suggestedTitle: string
  kcal: number
  protein: number
  carbs: number
  fat: number
  note?: string
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    suggestedTitle: {
      type: 'STRING',
      description: 'Kurzer, prägnanter Titel für das Gericht auf Deutsch, z.B. "Hähnchen mit Reis".',
    },
    kcal: { type: 'NUMBER', description: 'Geschätzte Gesamt-Kalorien in kcal.' },
    protein: { type: 'NUMBER', description: 'Geschätztes Protein in Gramm.' },
    carbs: { type: 'NUMBER', description: 'Geschätzte Kohlenhydrate in Gramm.' },
    fat: { type: 'NUMBER', description: 'Geschätztes Fett in Gramm.' },
    note: {
      type: 'STRING',
      description:
        'Kurzer Hinweis (1 Satz, Deutsch) auf getroffene Annahmen, z.B. geschätzte Portionsgröße, falls Mengenangaben fehlten.',
    },
  },
  required: ['suggestedTitle', 'kcal', 'protein', 'carbs', 'fat'],
}

const SYSTEM_PROMPT = `Du bist ein Ernährungsassistent. Der Nutzer beschreibt eine Mahlzeit (Text und/oder Foto) auf Deutsch, ggf. mit ungefähren Mengenangaben in Gramm oder Haushaltsmaßen. Schätze die Nährwerte auf Basis üblicher Standard-Nährwerttabellen (wie sie z.B. USDA oder gängige Lebensmitteldatenbanken verwenden) für die GESAMTE beschriebene Menge (nicht pro 100g). Wenn Mengenangaben fehlen, nimm plausible durchschnittliche Portionsgrößen an und erwähne das kurz in "note". Antworte ausschließlich als JSON gemäß dem vorgegebenen Schema.`

interface GeminiPart {
  text?: string
  inline_data?: { mime_type: string; data: string }
}

interface GeminiResponse {
  candidates?: { content: { parts: GeminiPart[] } }[]
  error?: { message: string }
  promptFeedback?: { blockReason?: string }
}

export async function estimateNutrition(params: {
  description: string
  photoDataUrl?: string
}): Promise<NutritionEstimate> {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new GeminiError('Kein API-Key hinterlegt. Bitte in den Einstellungen eintragen.')
  }

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
        contents: [{ role: 'user', parts }],
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
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

  let parsed: Partial<NutritionEstimate>
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new GeminiError('Gemini-Antwort war kein gültiges JSON. Bitte erneut versuchen.')
  }

  return {
    suggestedTitle: String(parsed.suggestedTitle ?? 'Mahlzeit'),
    kcal: Number(parsed.kcal) || 0,
    protein: Number(parsed.protein) || 0,
    carbs: Number(parsed.carbs) || 0,
    fat: Number(parsed.fat) || 0,
    note: parsed.note ? String(parsed.note) : undefined,
  }
}
