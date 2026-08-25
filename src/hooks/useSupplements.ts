import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  newMySupplementId,
  newSupplementId,
  newSupplementLogId,
  type MySupplement,
  type Supplement,
  type SupplementLogEntry,
  type SupplementAdvisorRun,
  type SupplementRecommendation,
  type SupplementTimeOfDay,
} from '../lib/db'

/** The full catalog (seed + custom), newest custom additions first-ish — sorted by name for a stable, browsable list. */
export function useAllSupplements(): Supplement[] | undefined {
  return useLiveQuery(() => db.supplements.orderBy('name').toArray(), [])
}

export function useSupplement(id: string | undefined): Supplement | undefined {
  return useLiveQuery(() => (id ? db.supplements.get(id) : undefined), [id])
}

export async function saveSupplement(supplement: Supplement): Promise<void> {
  await db.supplements.put(supplement)
}

export async function deleteSupplement(id: string): Promise<void> {
  await db.supplements.delete(id)
}

/** Adds a user-created catalog entry (the "Zutat +"-style manual path, not from an AI suggestion). */
export function newCustomSupplement(
  fields: Pick<Supplement, 'name' | 'category' | 'description' | 'typicalDosage'>,
): Supplement {
  return { ...fields, id: newSupplementId(), isCustom: true, createdAt: Date.now() }
}

/** The user's personal routine — every supplement they've actually added. */
export function useMySupplements(): MySupplement[] | undefined {
  return useLiveQuery(() => db.mySupplements.orderBy('createdAt').toArray(), [])
}

export async function addMySupplement(
  fields: Pick<MySupplement, 'supplementId' | 'timesOfDay' | 'dosage'>,
): Promise<void> {
  const entry: MySupplement = { ...fields, id: newMySupplementId(), createdAt: Date.now() }
  await db.mySupplements.put(entry)
}

export async function updateMySupplement(entry: MySupplement): Promise<void> {
  await db.mySupplements.put(entry)
}

/** Removes a supplement from the active routine. Past check-ins for it are left in place — they stay valid history for the adherence stats, they just no longer surface anywhere since nothing references this id going forward. */
export async function removeMySupplement(id: string): Promise<void> {
  await db.mySupplements.delete(id)
}

/** All check-ins for one local date — the raw material the daily checklist and the stats adherence view both derive their state from. */
export function useSupplementLogForDate(dateKey: string): SupplementLogEntry[] | undefined {
  return useLiveQuery(() => db.supplementLog.where('date').equals(dateKey).toArray(), [dateKey])
}

/** All check-ins between two dates, inclusive — used by the Statistik adherence view. */
export function useSupplementLogInRange(startKey: string, endKey: string): SupplementLogEntry[] | undefined {
  return useLiveQuery(
    () => db.supplementLog.where('date').between(startKey, endKey, true, true).toArray(),
    [startKey, endKey],
  )
}

/** The newest stored advisor run — what the Vorschläge tab renders. Live, so the daily background refresh appears without a reload. */
export function useLatestAdvisorRun(): SupplementAdvisorRun | undefined | null {
  return useLiveQuery(async () => (await db.supplementAdvisorRuns.orderBy('generatedAt').last()) ?? null, [])
}

/**
 * Commits one AI suggestion to the user's routine in a single tap: reuses a
 * catalog entry whose name already matches (case-insensitive) so accepting
 * the same suggestion twice — or one that happens to name an existing
 * catalog item — doesn't fork into a duplicate custom entry, otherwise
 * creates a new custom one from the suggestion's own fields.
 */
export async function addSuggestionToMyList(suggestion: SupplementRecommendation): Promise<void> {
  const normalized = suggestion.supplementName.trim().toLowerCase()
  const existing = await db.supplements.filter((s) => s.name.trim().toLowerCase() === normalized).first()
  const catalogEntry =
    existing ??
    (() => {
      const entry: Supplement = {
        id: newSupplementId(),
        name: suggestion.supplementName.trim(),
        category: suggestion.category,
        description: '',
        typicalDosage: suggestion.suggestedDosage,
        isCustom: true,
        createdAt: Date.now(),
      }
      return entry
    })()
  if (!existing) await db.supplements.put(catalogEntry)

  await addMySupplement({
    supplementId: catalogEntry.id,
    dosage: suggestion.suggestedDosage,
    timesOfDay: suggestion.suggestedTimesOfDay.length > 0 ? suggestion.suggestedTimesOfDay : ['morning'],
  })
}

/**
 * Flips one (supplement, date, time-of-day) slot. Only "taken" states are
 * ever stored as rows (see SupplementLogEntry's doc comment), so toggling
 * off means deleting the row, not writing a false flag.
 */
export async function toggleSupplementCheck(
  mySupplementId: string,
  date: string,
  timeOfDay: SupplementTimeOfDay,
): Promise<void> {
  const existing = await db.supplementLog
    .where('[mySupplementId+date+timeOfDay]')
    .equals([mySupplementId, date, timeOfDay])
    .first()
  if (existing) {
    await db.supplementLog.delete(existing.id)
  } else {
    await db.supplementLog.add({ id: newSupplementLogId(), mySupplementId, date, timeOfDay, checkedAt: Date.now() })
  }
}
