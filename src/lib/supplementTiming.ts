import type { SupplementTimeOfDay } from './db'

/**
 * Time-of-day windows, deliberately confined within a single calendar day
 * (night ends at 24:00, doesn't wrap into the small hours of the next day).
 * That sidesteps a real ambiguity — does 2am "belong" to yesterday's night
 * or today's not-yet-started one? — at a near-zero real cost: nobody is
 * expected to be logging supplements between 00:00 and 05:00 anyway, so
 * that stretch simply has no "current" slot at all, which is the honest
 * answer regardless.
 */
const WINDOW_START_HOUR: Record<SupplementTimeOfDay, number> = { morning: 5, noon: 11, evening: 15, night: 22 }
const WINDOW_END_HOUR: Record<SupplementTimeOfDay, number> = { morning: 11, noon: 15, evening: 22, night: 24 }

export type SupplementSlotState = 'pending' | 'current' | 'checked' | 'missed'

/**
 * The single source of truth for how one (supplement, day, time-of-day)
 * slot should render — the daily checklist's big-vs-compact sizing and the
 * Statistik adherence view both derive their state from this.
 */
export function computeSlotState(params: {
  /** The local date key (YYYY-MM-DD) this slot belongs to. */
  date: string
  timeOfDay: SupplementTimeOfDay
  /** Whether a SupplementLogEntry already exists for this exact slot. */
  checked: boolean
  todayKey: string
  now?: Date
}): SupplementSlotState {
  const { date, timeOfDay, checked, todayKey, now = new Date() } = params
  if (checked) return 'checked'
  if (date < todayKey) return 'missed'
  if (date > todayKey) return 'pending'

  const nowHour = now.getHours() + now.getMinutes() / 60
  if (nowHour < WINDOW_START_HOUR[timeOfDay]) return 'pending'
  if (nowHour >= WINDOW_END_HOUR[timeOfDay]) return 'missed'
  return 'current'
}
