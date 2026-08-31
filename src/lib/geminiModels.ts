/**
 * The models the app rotates through, in the order it tries them, together
 * with the free-tier daily request limits they are published with.
 *
 * The limits are Google's documented free-tier figures, not something the app
 * can verify — they exist so the usage bars have something to be a fraction
 * of, and so the app can stop leaning on a model it has probably exhausted
 * before the API says so.
 */
export interface GeminiModelSpec {
  id: string
  label: string
  /** Published free-tier requests per day. */
  dailyLimit: number
}

export const GEMINI_MODELS: GeminiModelSpec[] = [
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', dailyLimit: 1500 },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite', dailyLimit: 1500 },
  { id: 'gemini-3-flash', label: 'Gemini 3 Flash', dailyLimit: 1500 },
]

export const DEFAULT_MODEL = GEMINI_MODELS[0].id

const EXHAUSTED_KEY = 'kcal-tracker:gemini-exhausted'

/** Model id → the Pacific date on which it reported an exhausted quota. */
type ExhaustedMap = Record<string, string>

function pacificDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function readExhausted(): ExhaustedMap {
  try {
    const raw = window.localStorage.getItem(EXHAUSTED_KEY)
    const parsed = raw ? (JSON.parse(raw) as ExhaustedMap) : {}
    const today = pacificDateKey()
    // Entries from an earlier day have had their quota reset since.
    return Object.fromEntries(Object.entries(parsed).filter(([, day]) => day === today))
  } catch {
    return {}
  }
}

function writeExhausted(map: ExhaustedMap): void {
  try {
    window.localStorage.setItem(EXHAUSTED_KEY, JSON.stringify(map))
  } catch {
    // Losing this only costs one wasted 429 next time.
  }
}

/**
 * Notes that a model answered "quota exhausted", so the rotation skips it for
 * the rest of the day.
 *
 * Remembered rather than rediscovered: without it every single request would
 * spend a round-trip failing on the exhausted model before moving on, all day
 * long. The marker clears itself at the Pacific day boundary, which is when
 * the real quota resets — so a model that recovers is picked up again on its
 * own, with nothing to reset by hand.
 */
export function markExhausted(modelId: string): void {
  const map = readExhausted()
  map[modelId] = pacificDateKey()
  writeExhausted(map)
}

export function isExhausted(modelId: string): boolean {
  return modelId in readExhausted()
}

export function exhaustedModels(): string[] {
  return Object.keys(readExhausted())
}

/**
 * The models to try for the next request, best first.
 *
 * `preferred` (the user's chosen model) leads if it still has quota. Anything
 * known to be exhausted is moved to the back rather than dropped: if every
 * model is marked, the request still gets attempted instead of failing without
 * ever reaching the network — the markers are an optimisation, and a stale one
 * must not be able to take the feature offline.
 */
export function modelOrder(preferred: string): string[] {
  const all = [preferred, ...GEMINI_MODELS.map((m) => m.id).filter((id) => id !== preferred)]
  const unique = [...new Set(all)]
  const available = unique.filter((id) => !isExhausted(id))
  const spent = unique.filter((id) => isExhausted(id))
  return [...available, ...spent]
}
