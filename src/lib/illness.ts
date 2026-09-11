import { useLiveQuery } from 'dexie-react-hooks'
import { db, toLocalDateKey, type Nutrition, type SickDay } from './db'
import { computeDailyTargets, getBodyProfile } from './bodyProfile'
import { estimateIllnessTargets } from './gemini'

/** How far back "recent eating habits" looks when grounding an on-request target suggestion — long enough to smooth over a couple of one-off days, short enough to still reflect how the user eats right now. */
const RECENT_HABITS_DAYS = 30

/** Single day, live. `undefined` while loading, `null` when the day isn't marked sick at all. */
export function useSickDay(dateKey: string): SickDay | null | undefined {
  return useLiveQuery(async () => (await db.sickDays.get(dateKey)) ?? null, [dateKey])
}

/** Set of date keys marked sick within a range — for the calendar's red-digit marker, mirroring useMealsInRange's daysWithMeals pattern. */
export function useSickDaysInRange(startKey: string, endKey: string): Set<string> | undefined {
  return useLiveQuery(async () => {
    const rows = await db.sickDays.where('date').between(startKey, endKey, true, true).toArray()
    return new Set(rows.map((r) => r.date))
  }, [startKey, endKey])
}

/**
 * One illness, not one day — consecutive calendar dates marked sick fold
 * into a single episode (Round 6, v2.6, explicit request: "Tage, die ich
 * hintereinander weg als krank markiere, sollen auch als zusammenhängende
 * Krankheit erkannt werden und nicht jeder Tag einzeln"). `category` takes
 * whichever day in the run set one first; `severities` keeps every day's
 * own reading in order, since the whole point of a per-day scale is that it
 * can move within one illness.
 */
/** Shared with SickDaySheet (entry) and SusceptibilitySheet (history detail) so both read the same names for the same values. */
export const CATEGORY_LABELS: Record<NonNullable<SickDay['category']>, string> = {
  erkaeltung: 'Erkältung',
  grippe: 'Grippe',
  magen_darm: 'Magen-Darm',
  sonstiges: 'Sonstiges',
}

export interface IllnessEpisode {
  startDate: string
  endDate: string
  days: number
  category?: SickDay['category']
  severities: NonNullable<SickDay['severity']>[]
}

const SEVERITY_SCORE: Record<NonNullable<SickDay['severity']>, number> = { leicht: 1, mittel: 2, schwer: 3 }
const SEVERITY_LABEL: Record<number, NonNullable<SickDay['severity']>> = { 1: 'leicht', 2: 'mittel', 3: 'schwer' }

function addOneDay(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + 1)
  return toLocalDateKey(date)
}

/** Groups sick days into episodes — see IllnessEpisode's own doc comment. `sickDays` need not be pre-sorted. */
export function groupIntoEpisodes(sickDays: SickDay[]): IllnessEpisode[] {
  const sorted = [...sickDays].sort((a, b) => a.date.localeCompare(b.date))
  const episodes: IllnessEpisode[] = []
  for (const day of sorted) {
    const current = episodes[episodes.length - 1]
    if (current && addOneDay(current.endDate) === day.date) {
      current.endDate = day.date
      current.days++
      current.category ??= day.category
      if (day.severity) current.severities.push(day.severity)
    } else {
      episodes.push({
        startDate: day.date,
        endDate: day.date,
        days: 1,
        category: day.category,
        severities: day.severity ? [day.severity] : [],
      })
    }
  }
  return episodes
}

/** Ø days per episode — "wie lange bin ich im Schnitt krank". null with no episodes yet. */
export function averageEpisodeDurationDays(episodes: IllnessEpisode[]): number | null {
  if (episodes.length === 0) return null
  return episodes.reduce((sum, e) => sum + e.days, 0) / episodes.length
}

/** The most recently ENDED episode — "wann war ich zuletzt krank". Episodes come oldest-first (see useIllnessEpisodes), so this is simply the last one. */
export function mostRecentEpisode(episodes: IllnessEpisode[]): IllnessEpisode | null {
  return episodes.length > 0 ? episodes[episodes.length - 1] : null
}

/** "DD.MM.YYYY" from a local date key — used wherever an episode's start/end date is shown. */
export function formatDateKey(key: string): string {
  const [y, m, d] = key.split('-')
  return `${d}.${m}.${y}`
}

export const SEVERITY_DISPLAY_LABEL: Record<NonNullable<SickDay['severity']>, string> = {
  leicht: 'Leichter Verlauf',
  mittel: 'Mittlerer Verlauf',
  schwer: 'Schwerer Verlauf',
}

/** One episode's own mean severity, rounded to the nearest label — the per-episode step averageSeverityLabel builds on, exposed separately for the illness-history detail list (SusceptibilitySheet). Null when nothing was reported for that episode. */
export function episodeSeverityLabel(episode: IllnessEpisode): NonNullable<SickDay['severity']> | null {
  if (episode.severities.length === 0) return null
  const avg = episode.severities.reduce((sum, s) => sum + SEVERITY_SCORE[s], 0) / episode.severities.length
  return SEVERITY_LABEL[Math.round(Math.min(3, Math.max(1, avg)))]
}

/**
 * "Im Schnitt hast du einen leichten/mittleren/schweren Verlauf" — averaged
 * per EPISODE, not per raw day: each illness counts once regardless of how
 * many days it ran, since the question is about how illnesses typically
 * feel, not which severity value shows up on the most individual days. An
 * episode with no severity entered at all doesn't contribute (nothing was
 * reported for it); null when nobody has entered a severity yet anywhere.
 */
export function averageSeverityLabel(episodes: IllnessEpisode[]): NonNullable<SickDay['severity']> | null {
  const episodeLabels = episodes
    .map((e) => episodeSeverityLabel(e))
    .filter((l): l is NonNullable<SickDay['severity']> => l !== null)
  if (episodeLabels.length === 0) return null
  const overall = episodeLabels.reduce((sum, l) => sum + SEVERITY_SCORE[l], 0) / episodeLabels.length
  return SEVERITY_LABEL[Math.round(Math.min(3, Math.max(1, overall)))]
}

/** All sick days ever logged, grouped into episodes, oldest first. */
export function useIllnessEpisodes(): IllnessEpisode[] | undefined {
  return useLiveQuery(async () => groupIntoEpisodes(await db.sickDays.toArray()), [])
}

/**
 * Instant on/off toggle — the sick-day button's single-tap behavior. Creates
 * a bare row (no category/note yet) when turning on; removes the row
 * entirely when turning off, rather than leaving a "not sick" row behind.
 */
export async function toggleSickDay(dateKey: string): Promise<boolean> {
  const existing = await db.sickDays.get(dateKey)
  if (existing) {
    await db.sickDays.delete(dateKey)
    return false
  }
  const now = Date.now()
  await db.sickDays.put({ date: dateKey, createdAt: now, updatedAt: now })
  return true
}

/** Saves the detail Sheet's fields (category/note/severity/adjustTargets) without touching any existing targetOverride. */
export async function saveSickDayDetails(
  dateKey: string,
  details: { category?: SickDay['category']; note?: string; severity?: SickDay['severity']; adjustTargets?: boolean },
): Promise<void> {
  const existing = await db.sickDays.get(dateKey)
  const now = Date.now()
  await db.sickDays.put({
    date: dateKey,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    targetOverride: existing?.targetOverride,
    ...details,
  })
}

/**
 * Average daily intake over the last RECENT_HABITS_DAYS, excluding the day
 * itself and any other day already marked sick — grounds the AI's suggestion
 * in how the user actually eats on a normal day, not in a sick stretch that
 * happened to precede it. Returns null when there's not enough history to
 * say anything meaningful (fewer than 5 normal days logged).
 */
async function computeRecentNormalAverage(excludeDateKey: string): Promise<Nutrition | null> {
  const startKey = toLocalDateKey(new Date(Date.now() - RECENT_HABITS_DAYS * 86_400_000))
  const [meals, sickRows] = await Promise.all([
    db.meals.where('date').aboveOrEqual(startKey).toArray(),
    db.sickDays.where('date').aboveOrEqual(startKey).toArray(),
  ])
  const excluded = new Set(sickRows.map((r) => r.date))
  excluded.add(excludeDateKey)

  const byDate = new Map<string, Nutrition>()
  for (const m of meals) {
    if (excluded.has(m.date)) continue
    const acc = byDate.get(m.date) ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 }
    acc.kcal += m.nutrition.kcal
    acc.protein += m.nutrition.protein
    acc.carbs += m.nutrition.carbs
    acc.fat += m.nutrition.fat
    byDate.set(m.date, acc)
  }

  const days = [...byDate.values()]
  if (days.length < 5) return null

  const sum = days.reduce(
    (acc, d) => ({ kcal: acc.kcal + d.kcal, protein: acc.protein + d.protein, carbs: acc.carbs + d.carbs, fat: acc.fat + d.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )
  return { kcal: sum.kcal / days.length, protein: sum.protein / days.length, carbs: sum.carbs / days.length, fat: sum.fat / days.length }
}

/**
 * Runs the on-request AI computation for one sick day and stores the result
 * on that day's SickDay row — ONLY called from the detail Sheet's "Nährwerte
 * anpassen" action, never automatically (see estimateIllnessTargets's own
 * doc comment for why). Returns the computed result so the Sheet can show it
 * immediately without waiting on the live query to catch up.
 */
export async function requestIllnessTargetAdjustment(dateKey: string): Promise<NonNullable<SickDay['targetOverride']>> {
  const profile = getBodyProfile()
  const normalTargets = profile ? computeDailyTargets(profile) : { kcal: 2000, protein: 100, carbs: 200, fat: 70 }
  const sickDay = await db.sickDays.get(dateKey)
  const recentAverage = await computeRecentNormalAverage(dateKey)

  const result = await estimateIllnessTargets({
    normalTargets,
    bodyProfile: profile,
    category: sickDay?.category,
    note: sickDay?.note,
    recentAverage,
  })

  const targetOverride = { ...result, computedAt: Date.now() }
  const now = Date.now()
  await db.sickDays.put({
    date: dateKey,
    category: sickDay?.category,
    note: sickDay?.note,
    adjustTargets: true,
    createdAt: sickDay?.createdAt ?? now,
    updatedAt: now,
    targetOverride,
  })
  return targetOverride
}
