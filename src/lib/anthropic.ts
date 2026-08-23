import { getApiKey } from './settings'

const API_URL = 'https://api.anthropic.com/v1/messages'
const DEFAULT_MODEL = 'claude-sonnet-5'
const MODEL_STORAGE_KEY = 'kcal-tracker:anthropic-model'

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

export class AnthropicError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'AnthropicError'
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

const NUTRITION_TOOL = {
  name: 'estimate_nutrition',
  description:
    'Liefert eine geschätzte Nährwertangabe für die beschriebene Mahlzeit basierend auf Standard-Nährwerttabellen.',
  input_schema: {
    type: 'object' as const,
    properties: {
      suggestedTitle: {
        type: 'string',
        description: 'Kurzer, prägnanter Titel für das Gericht auf Deutsch, z.B. "Hähnchen mit Reis".',
      },
      kcal: { type: 'number', description: 'Geschätzte Gesamt-Kalorien in kcal.' },
      protein: { type: 'number', description: 'Geschätztes Protein in Gramm.' },
      carbs: { type: 'number', description: 'Geschätzte Kohlenhydrate in Gramm.' },
      fat: { type: 'number', description: 'Geschätztes Fett in Gramm.' },
      note: {
        type: 'string',
        description:
          'Kurzer Hinweis (1 Satz, Deutsch) auf getroffene Annahmen, z.B. geschätzte Portionsgröße, falls Mengenangaben fehlten.',
      },
    },
    required: ['suggestedTitle', 'kcal', 'protein', 'carbs', 'fat'],
  },
}

const SYSTEM_PROMPT = `Du bist ein Ernährungsassistent. Der Nutzer beschreibt eine Mahlzeit (Text und/oder Foto) auf Deutsch, ggf. mit ungefähren Mengenangaben in Gramm oder Haushaltsmaßen. Schätze die Nährwerte auf Basis üblicher Standard-Nährwerttabellen (wie sie z.B. USDA oder gängige Lebensmitteldatenbanken verwenden) für die GESAMTE beschriebene Menge (nicht pro 100g). Wenn Mengenangaben fehlen, nimm plausible durchschnittliche Portionsgrößen an und erwähne das kurz in "note". Antworte ausschließlich über das bereitgestellte Tool.`

interface AnthropicContentBlock {
  type: string
  text?: string
  input?: Record<string, unknown>
}

interface AnthropicResponse {
  content: AnthropicContentBlock[]
  error?: { message: string }
}

export async function estimateNutrition(params: {
  description: string
  photoDataUrl?: string
}): Promise<NutritionEstimate> {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new AnthropicError('Kein API-Key hinterlegt. Bitte in den Einstellungen eintragen.')
  }

  const content: Record<string, unknown>[] = []

  if (params.photoDataUrl) {
    const match = params.photoDataUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (match) {
      const [, mediaType, base64Data] = match
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: base64Data },
      })
    }
  }

  content.push({
    type: 'text',
    text: params.description.trim()
      ? `Beschreibung der Mahlzeit: ${params.description.trim()}`
      : 'Schätze die Nährwerte anhand des Fotos.',
  })

  let response: Response
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: getModel(),
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: [NUTRITION_TOOL],
        tool_choice: { type: 'tool', name: 'estimate_nutrition' },
        messages: [{ role: 'user', content }],
      }),
    })
  } catch {
    throw new AnthropicError(
      'Netzwerkfehler beim Aufruf der Claude-API. Prüfe deine Internetverbindung.',
    )
  }

  if (!response.ok) {
    let message = `Claude-API-Fehler (${response.status})`
    try {
      const errBody = (await response.json()) as AnthropicResponse
      if (errBody?.error?.message) message = errBody.error.message
    } catch {
      // ignore parse failure, keep generic message
    }
    if (response.status === 401) {
      message = 'API-Key ungültig oder abgelaufen. Bitte in den Einstellungen prüfen.'
    }
    throw new AnthropicError(message, response.status)
  }

  const data = (await response.json()) as AnthropicResponse
  const toolUse = data.content.find((block) => block.type === 'tool_use')
  if (!toolUse?.input) {
    throw new AnthropicError('Claude hat keine strukturierte Antwort geliefert. Bitte erneut versuchen.')
  }

  const input = toolUse.input as Partial<NutritionEstimate>
  return {
    suggestedTitle: String(input.suggestedTitle ?? 'Mahlzeit'),
    kcal: Number(input.kcal) || 0,
    protein: Number(input.protein) || 0,
    carbs: Number(input.carbs) || 0,
    fat: Number(input.fat) || 0,
    note: input.note ? String(input.note) : undefined,
  }
}
