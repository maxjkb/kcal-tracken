import type { MealType } from './db'

/**
 * Which of the Feed's four meal-time tiles are collapsed, remembered across
 * remounts (navigating away and back, reloading the app) instead of always
 * resetting to the same default — Round 5 (v2.5): explicit feedback that
 * the tiles kept "reopening themselves" on every visit.
 *
 * Only the single most-recently-touched date is kept, not a permanent
 * per-day archive — the point is "stay as I left them for as long as I'm
 * looking at this day", not a history of every day ever opened. A date
 * with no stored entry (a day nobody has touched this session, most
 * commonly a brand new day) falls back to all-collapsed — the explicit
 * exception: "a new day starts closed". Since FeedPage's own `dateKey`
 * state only ever changes via explicit navigation (there's no live clock
 * ticking it forward at midnight), a day already open on screen never gets
 * yanked shut out from under whoever is actively looking at it — the reset
 * only ever shows up the next time the page is freshly opened on a day
 * that wasn't the stored one yet.
 */

const STORAGE_KEY = 'kcal-tracker:feed-collapsed'

export const ALL_COLLAPSED: Record<MealType, boolean> = {
  breakfast: true,
  lunch: true,
  dinner: true,
  snack: true,
}

interface StoredFeedCollapse {
  date: string
  collapsed: Record<MealType, boolean>
}

export function getFeedCollapse(dateKey: string): Record<MealType, boolean> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const stored = JSON.parse(raw) as StoredFeedCollapse
    return stored.date === dateKey ? stored.collapsed : null
  } catch {
    return null
  }
}

export function setFeedCollapse(dateKey: string, collapsed: Record<MealType, boolean>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: dateKey, collapsed }))
  } catch {
    // Best-effort — a full/unavailable localStorage just means the
    // collapse state won't survive a remount this time, nothing worse.
  }
}
