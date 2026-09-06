import { toLocalDateKey } from './db'

/**
 * Per-day dismissal for the "Schon auf der Liste" / "Nicht mehr notwendig"
 * hint cards on the Supplements page — these reference something already
 * on the user's own routine rather than proposing a new addition, so unlike
 * a "new" suggestion there's no action that makes them go away on their
 * own. Without this they simply reappeared every single day, which is the
 * "Hinweise... können nicht weg gemacht werden" report.
 *
 * Dismissal is for the rest of today only, not forever: the advisor run
 * that produces these regenerates once a day from the user's actual data,
 * so a hint dismissed today can legitimately still be true tomorrow — this
 * is "stop telling me right now", not "never tell me this again".
 */
const STORAGE_KEY = 'kcal-tracker:dismissed-supp-hints'

/** Dismissal key → the local date it was dismissed on. */
type DismissedMap = Record<string, string>

function read(): DismissedMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as DismissedMap) : {}
    const today = toLocalDateKey(new Date())
    // Entries from an earlier day are stale — today's advisor run gets a
    // clean slate, not yesterday's dismissals silently carried forward.
    return Object.fromEntries(Object.entries(parsed).filter(([, day]) => day === today))
  } catch {
    return {}
  }
}

function write(map: DismissedMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Losing this only costs the hint reappearing once more today.
  }
}

/** Stable key for one hint card — kind and name together, since a supplement could in principle carry more than one kind of hint. */
export function dismissalKey(kind: string, supplementName: string): string {
  return `${kind}:${supplementName.trim().toLowerCase()}`
}

export function isHintDismissedToday(key: string): boolean {
  return key in read()
}

export function dismissHintForToday(key: string): void {
  const map = read()
  map[key] = toLocalDateKey(new Date())
  write(map)
}
