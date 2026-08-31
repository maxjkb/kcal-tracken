import { useLiveQuery } from 'dexie-react-hooks'
import { db, type MealprepVersion } from '../lib/db'

/**
 * All Mealprep versions saved for one recipe, newest first.
 *
 * Not synced across devices (unlike meals/recipes/profile — see lib/sync.ts):
 * same precedent as supplementAdvisorRuns/tipRuns/dailyTargetSnapshots —
 * generated, device-local convenience data rather than something the user
 * deliberately curated, so it doesn't carry the sync machinery's weight.
 */
export function useMealprepVersions(recipeId: string): MealprepVersion[] | undefined {
  return useLiveQuery(
    () => db.mealprepVersions.where('recipeId').equals(recipeId).reverse().sortBy('createdAt'),
    [recipeId],
  )
}

export async function saveMealprepVersion(version: MealprepVersion): Promise<void> {
  await db.mealprepVersions.put(version)
}

export async function deleteMealprepVersion(id: string): Promise<void> {
  await db.mealprepVersions.delete(id)
}
