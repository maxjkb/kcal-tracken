import { useLiveQuery } from 'dexie-react-hooks'
import { getBodyProfile } from '../lib/bodyProfile'
import { computeMicronutrientOverview, type MicronutrientOverview } from '../lib/micronutrients'

/**
 * The rolling 7-day micronutrient picture ending at `endDateKey`. `null`
 * when no body profile is set — there's no sex to pick a reference intake
 * against (iron needs it), the same gate computeDailyTargets already
 * applies to the macro targets elsewhere.
 */
export function useMicronutrientOverview(endDateKey: string): MicronutrientOverview | undefined | null {
  const bodyProfile = getBodyProfile()
  return useLiveQuery(async () => {
    if (!bodyProfile) return null
    return computeMicronutrientOverview(endDateKey, bodyProfile.sex)
  }, [endDateKey, bodyProfile?.sex])
}
