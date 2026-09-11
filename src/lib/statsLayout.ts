/**
 * Which chart tiles the Statistik feed shows, and in what order — the user's
 * own arrangement, set via the page's "Bearbeiten" sheet and kept forever
 * until changed again (device-local, same as the other plain-localStorage
 * preferences in this app — body profile, the Gemini model choice).
 *
 * Round 5 (v2.5): the page used to switch between entirely different
 * "Ansichten" (Tag/Woche/Monat/Jahr), each replacing what was on screen.
 * Explicit request: no more switching — every chart stands on the page at
 * once, in a long feed, and the ORDER of that feed is the one thing left to
 * customize. The three headline tiles at the top (balance/Ø-kcal/macros)
 * and the icon jump-row beneath them are fixed, not part of this list —
 * only the chart tiles below them reorder.
 */

export type StatsTileKey = 'kcal' | 'suppScore' | 'illness' | 'micronutrients' | 'carbs' | 'protein' | 'fat'

export const DEFAULT_STATS_LAYOUT: StatsTileKey[] = ['kcal', 'suppScore', 'illness', 'micronutrients', 'carbs', 'protein', 'fat']

const STORAGE_KEY = 'kcal-tracker:stats-layout'

/**
 * Reads the saved order, filtered/completed against the current known tile
 * set — so a future app version adding an 8th tile still shows it (appended
 * at the end) for someone with an old saved order, and a stored key that no
 * longer exists (a removed tile from an old version) is silently dropped
 * rather than rendering nothing for it.
 */
export function getStatsLayout(): StatsTileKey[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATS_LAYOUT
    const stored = JSON.parse(raw) as string[]
    const known = new Set(DEFAULT_STATS_LAYOUT)
    const kept = stored.filter((k): k is StatsTileKey => known.has(k as StatsTileKey))
    const missing = DEFAULT_STATS_LAYOUT.filter((k) => !kept.includes(k))
    return [...kept, ...missing]
  } catch {
    return DEFAULT_STATS_LAYOUT
  }
}

export function setStatsLayout(order: StatsTileKey[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(order))
}
