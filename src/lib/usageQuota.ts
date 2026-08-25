/**
 * A local tally of the requests this app makes against daily-capped services.
 *
 * ## What this is, and what it is not
 *
 * There is no way to ask either service how much of your quota is actually
 * gone. The Gemini Developer API exposes no usage endpoint to an API key —
 * consumption is only readable through Cloud Monitoring with service-account
 * credentials a browser doesn't have, and Firebase never exposes the daily
 * sign-in-email allowance at all. So this counts what *this installation*
 * sends and compares it against the published limits.
 *
 * That makes it a lower bound, not the truth: requests made from another
 * device, another browser profile, or any other project using the same key are
 * invisible here. Everything built on this must say so where the user reads
 * it — a bar that claims to know your remaining quota, and is wrong, is worse
 * than no bar.
 */

const STORAGE_KEY = 'kcal-tracker:usage-counters'

/**
 * Gemini's daily request quota resets at midnight **Pacific time**, not local
 * midnight. Counting by local date would clear the tally at the wrong moment —
 * hours early or hours late depending on the timezone — and show a fresh bar
 * while the real quota was still spent.
 */
function pacificDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

interface CounterState {
  /** Pacific date the counts below belong to. */
  day: string
  counts: Record<string, number>
}

function read(): CounterState {
  const today = pacificDateKey()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as CounterState) : null
    if (!parsed || parsed.day !== today) return { day: today, counts: {} }
    return { day: today, counts: parsed.counts ?? {} }
  } catch {
    return { day: today, counts: {} }
  }
}

function write(state: CounterState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Private mode or a full quota — losing the tally is not worth breaking a
    // request that otherwise succeeded.
  }
}

/** Counts one request against `id`. Rolls over automatically at the Pacific day boundary. */
export function recordUsage(id: string): void {
  const state = read()
  state.counts[id] = (state.counts[id] ?? 0) + 1
  write(state)
  notify()
}

export function getUsage(id: string): number {
  return read().counts[id] ?? 0
}

/** All counters for the current day, for the settings screen. */
export function getAllUsage(): Record<string, number> {
  return read().counts
}

/** When the current tally rolls over, as a local-time Date — Pacific midnight. */
export function nextResetAt(): Date {
  const now = new Date()
  // Midnight Pacific expressed in this device's own clock: take Pacific's
  // current wall-clock time, work out how far it is from midnight, and add
  // that to now.
  const pacificNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
  const msIntoDay =
    pacificNow.getHours() * 3_600_000 + pacificNow.getMinutes() * 60_000 + pacificNow.getSeconds() * 1000
  return new Date(now.getTime() + (86_400_000 - msIntoDay))
}

// --- change notification, so an open settings screen updates live ---

type Listener = () => void
const listeners = new Set<Listener>()

function notify(): void {
  listeners.forEach((fn) => fn())
}

export function onUsageChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
