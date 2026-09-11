import { useLiveQuery } from 'dexie-react-hooks'
import { db, MICRONUTRIENT_LABELS, newSusceptibilityRunId, toLocalDateKey, type SusceptibilityRun } from './db'
import { getBodyProfile } from './bodyProfile'
import { computeMicronutrientOverview } from './micronutrients'
import { estimateSusceptibilityScore } from './gemini'
import { getApiKey } from './settings'
import { groupIntoEpisodes } from './illness'

/** How many calendar days a run stays valid — see SusceptibilityRun's own doc comment on why weekly is enough. */
const STALE_AFTER_DAYS = 7

/** How far back "recent illness" looks for the score's own context — a longer, coarser window than the 90-day one the AI prompt gets isn't needed here, this is the single number both use. */
const RECENT_ILLNESS_WINDOW_DAYS = 90

/** Latest computed run, live — undefined while loading, null if none has ever been computed. */
export function useLatestSusceptibilityRun(): SusceptibilityRun | null | undefined {
  return useLiveQuery(async () => (await db.susceptibilityRuns.orderBy('computedOn').last()) ?? null, [])
}

function daysSince(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number)
  const then = new Date(y, m - 1, d).getTime()
  const startOfToday = new Date().setHours(0, 0, 0, 0)
  return Math.round((startOfToday - then) / 86_400_000)
}

export function isSusceptibilityRunStale(run: SusceptibilityRun | null | undefined): boolean {
  return !run || daysSince(run.computedOn) >= STALE_AFTER_DAYS
}

/**
 * Meteorological (not astronomical) seasons — simpler, calendar-month-aligned,
 * and close enough for a soft heuristic like this. `isSouthernHemisphere`
 * flips the mapping by 6 months; defaults to the northern-hemisphere reading
 * whenever geolocation didn't resolve (see fetchCurrentWeather).
 */
export function currentSeason(date: Date, isSouthernHemisphere: boolean): string {
  const month = date.getMonth() // 0-11
  const northern = month === 11 || month <= 1 ? 'Winter' : month <= 4 ? 'Frühling' : month <= 7 ? 'Sommer' : 'Herbst'
  if (!isSouthernHemisphere) return northern
  const flip: Record<string, string> = { Winter: 'Sommer', Sommer: 'Winter', Frühling: 'Herbst', Herbst: 'Frühling' }
  return flip[northern]
}

interface WeatherResult {
  /** null whenever geolocation was denied/unavailable or the request failed — never invented. */
  temperatureC: number | null
  isSouthernHemisphere: boolean
}

/**
 * Best-effort current outdoor temperature via the browser's own Geolocation
 * API + Open-Meteo (free, keyless — matches this app's existing pattern of
 * not requiring credentials beyond the user's own Gemini key). Degrades
 * gracefully at every step: denied/unsupported geolocation, a network
 * failure, or a malformed response all resolve to `temperatureC: null`
 * rather than throwing, so the caller can proceed on season alone.
 */
export async function fetchCurrentWeather(): Promise<WeatherResult> {
  try {
    if (!navigator.geolocation) return { temperatureC: null, isSouthernHemisphere: false }
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, maximumAge: 3_600_000 })
    })
    const { latitude, longitude } = position.coords
    const isSouthernHemisphere = latitude < 0
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m`,
    )
    if (!response.ok) return { temperatureC: null, isSouthernHemisphere }
    const data = await response.json()
    const temperatureC = typeof data?.current?.temperature_2m === 'number' ? data.current.temperature_2m : null
    return { temperatureC, isSouthernHemisphere }
  } catch {
    return { temperatureC: null, isSouthernHemisphere: false }
  }
}

/**
 * Gathers season/weather/micronutrient-status/illness-history, asks Gemini
 * for the score, and stores the result — see estimateSusceptibilityScore's
 * own doc comment for why this is a soft, illustrative heuristic and not a
 * medical risk score. Always writes exactly one new row (there is no
 * "replace today's run" step, unlike the supplement advisor: this only ever
 * runs about once a week, so a history of weekly readings is the point, not
 * a debugging artifact to prune).
 */
export async function generateSusceptibilityRun(): Promise<SusceptibilityRun> {
  const today = toLocalDateKey(new Date())
  const profile = getBodyProfile()
  const weather = await fetchCurrentWeather()
  const season = currentSeason(new Date(), weather.isSouthernHemisphere)

  const [microOverview, allSickDays] = await Promise.all([
    profile ? computeMicronutrientOverview(today, profile.sex) : null,
    db.sickDays.toArray(),
  ])

  const episodes = groupIntoEpisodes(allSickDays)
  const recentCutoff = toLocalDateKey(new Date(Date.now() - RECENT_ILLNESS_WINDOW_DAYS * 86_400_000))
  const recentIllnessCount90d = episodes.filter((e) => e.endDate >= recentCutoff).length

  const lowMicronutrients = (microOverview?.statuses ?? []).filter((s) => s.band === 'low').map((s) => MICRONUTRIENT_LABELS[s.key])
  const micronutrientSummary = !profile
    ? 'Kein Körperprofil hinterlegt, keine Mikronährstoff-Einschätzung möglich.'
    : !microOverview || microOverview.daysWithEstimate === 0
      ? 'Noch keine ausreichenden Daten für eine Einschätzung.'
      : lowMicronutrients.length > 0
        ? `Unterrepräsentiert: ${lowMicronutrients.join(', ')}.`
        : 'Keine erkennbaren Lücken, Versorgung wirkt ausreichend.'

  const result = await estimateSusceptibilityScore({
    season,
    temperatureC: weather.temperatureC,
    micronutrientSummary,
    recentIllnessCount90d,
    totalEpisodeCount: episodes.length,
  })

  const run: SusceptibilityRun = {
    id: newSusceptibilityRunId(),
    computedOn: today,
    score: result.score,
    reasoning: result.reasoning,
    tips: result.tips,
    context: {
      season,
      temperatureC: weather.temperatureC,
      weatherAvailable: weather.temperatureC !== null,
      recentIllnessCount90d,
      micronutrientSummary,
    },
  }
  await db.susceptibilityRuns.put(run)
  return run
}

// Shares the in-flight promise across overlapping callers — same reasoning as
// supplementAdvisor.ts's refreshAdvisorIfStale: visibilitychange and focus
// can both fire off one app switch, and the staleness read is async.
let inFlight: Promise<void> | null = null

/**
 * The at-most-weekly automatic refresh. Silently does nothing without an API
 * key, and swallows failures — this runs unattended in the background (see
 * main.tsx), so a hiccup must never surface as an error the user never asked
 * to see. The previous score simply stays on screen until the next check.
 */
export function refreshSusceptibilityIfStale(): Promise<void> {
  inFlight ??= run().finally(() => {
    inFlight = null
  })
  return inFlight
}

async function run(): Promise<void> {
  if (!getApiKey()) return
  const latest = await db.susceptibilityRuns.orderBy('computedOn').last()
  if (!isSusceptibilityRunStale(latest)) return
  try {
    await generateSusceptibilityRun()
  } catch {
    // Intentionally silent — see above.
  }
}
