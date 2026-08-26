import { useLiveQuery } from 'dexie-react-hooks'
import { db, type TipsRun } from '../lib/db'

/** The newest stored tips run — live, so a refresh (app start or the Tipps sheet's own on-open check) appears without a reload. `undefined` while the initial query is in flight, `null` once resolved with nothing stored yet. */
export function useLatestTipsRun(): TipsRun | undefined | null {
  return useLiveQuery(async () => (await db.tipRuns.orderBy('generatedAt').last()) ?? null, [])
}
