import { useMemo } from 'react'
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
import { estimateSupplementContribution } from '../lib/gemini'
import { getApiKey } from '../lib/settings'
import { computeSupplementScore, type SupplementScoreOverview } from '../lib/supplementScore'

/** The full catalog (seed + custom), newest custom additions first-ish — sorted by name for a stable, browsable list. */
export function useAllSupplements(): Supplement[] | undefined {
  return useLiveQuery(() => db.supplements.orderBy('name').toArray(), [])
}

export async function saveSupplement(supplement: Supplement): Promise<void> {
  await db.supplements.put(supplement)
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

/**
 * One routine entry by id, live. Used by SupplementsPage's TodayTab to
 * re-read the just-saved dosage/times after closing SupplementFormSheet's
 * edit view (see the editing → viewing handoff there) — the `MySupplement`
 * object already held in that state is the pre-edit snapshot, so restoring
 * the view with it as-is would show stale values.
 */
export function useMySupplement(id: string | undefined): MySupplement | undefined {
  return useLiveQuery(() => (id ? db.mySupplements.get(id) : undefined), [id])
}

/**
 * Adds a catalog entry to the routine, or updates it if it is already there.
 *
 * Nothing used to stop the same supplement being added twice: the catalog row
 * showed "Auf Liste" but still opened the add sheet, and accepting the same AI
 * suggestion after a reload added a second row. The result was two identical
 * rows in the daily checklist and a doubled denominator in the adherence
 * figure. Updating the existing row is also what the user means by adding
 * something already on the list — they are changing its dosage or times.
 */
export async function addMySupplement(
  fields: Pick<MySupplement, 'supplementId' | 'timesOfDay' | 'dosage'>,
): Promise<void> {
  const existing = await db.mySupplements.where('supplementId').equals(fields.supplementId).first()
  if (existing) {
    await updateMySupplement({ ...existing, ...fields })
    return
  }
  const entry: MySupplement = { ...fields, id: newMySupplementId(), createdAt: Date.now() }
  await db.mySupplements.put(entry)
  void refreshSupplementContribution(entry.id, fields.supplementId, fields.dosage)
}

/**
 * Saves an edited entry, and — only when the dosage text itself actually
 * changed — kicks off a best-effort background re-estimate of what that
 * dosage now contributes to the tracked micronutrients (see
 * refreshSupplementContribution). Reading the previous row here rather than
 * trusting each caller to check first means every write path (the edit
 * sheet, addMySupplement's re-add branch above) gets this for free.
 */
export async function updateMySupplement(entry: MySupplement): Promise<void> {
  const previous = await db.mySupplements.get(entry.id)
  await db.mySupplements.put(entry)
  if (!previous || previous.dosage !== entry.dosage) {
    void refreshSupplementContribution(entry.id, entry.supplementId, entry.dosage)
  }
}

/**
 * Best-effort background fill for MySupplement.contribution — same shape as
 * lib/micronutrients.ts's backfillMissingMicronutrients: no API key, or a
 * failed estimate, just leaves the entry without a contribution (it simply
 * doesn't add to the micronutrient picture yet) rather than blocking the
 * add/edit that triggered it or surfacing a visible error for something the
 * user never directly asked to see. Re-reads the row before writing the
 * result back, since the Gemini round trip can outlive an edit or removal
 * that happened while it was in flight.
 */
async function refreshSupplementContribution(mySupplementId: string, supplementId: string, dosage: string): Promise<void> {
  if (!getApiKey()) return
  try {
    const catalogEntry = await db.supplements.get(supplementId)
    if (!catalogEntry) return
    const contribution = await estimateSupplementContribution(catalogEntry.name, dosage)
    const current = await db.mySupplements.get(mySupplementId)
    if (!current) return
    await db.mySupplements.put({ ...current, contribution })
  } catch {
    // Best-effort — the next dosage save (or backfillMissingSupplementContributions
    // on a later launch) simply tries again.
  }
}

/**
 * Fills in `contribution` for routine entries added before this field
 * existed, up to a per-launch cap — mirrors backfillMissingMicronutrients
 * one level up (routine entries rather than meals), including the same
 * "give up for this launch on the first failure, the rest retry next time"
 * behaviour. A user's active routine is realistically small (a handful of
 * entries, not hundreds of meals), so this runs sequentially with no
 * batching and no per-launch cap of its own.
 */
export async function backfillMissingSupplementContributions(): Promise<void> {
  if (!getApiKey()) return
  const missing = await db.mySupplements.filter((s) => !s.contribution).toArray()
  if (missing.length === 0) return

  const catalog = await db.supplements.toArray()
  const nameById = new Map(catalog.map((s) => [s.id, s.name]))

  for (const entry of missing) {
    const name = nameById.get(entry.supplementId)
    if (!name) continue
    try {
      const contribution = await estimateSupplementContribution(name, entry.dosage)
      await db.mySupplements.put({ ...entry, contribution })
    } catch {
      return
    }
  }
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

/**
 * The cumulative, all-time Supplementscore (see lib/supplementScore.ts) —
 * feeds both SupplementScoreCard and SuppScoreSheet, so the number shown in
 * Statistik and the breakdown behind it are always computed from the exact
 * same query, never two slightly different ones. Reads the *entire*
 * supplementLog table rather than a bounded range: unlike the meal/advisor
 * tables there is no natural per-launch cap here — a personal routine's log
 * stays small (tens of rows a month per entry, not the hundreds a meal
 * history can reach), so an unbounded live query is cheap and always
 * correct rather than needing its own staleness/pruning story.
 */
export function useSupplementScore(): SupplementScoreOverview | undefined {
  const mySupplements = useMySupplements()
  const supplements = useAllSupplements()
  const logEntries = useLiveQuery(() => db.supplementLog.toArray(), [])

  return useMemo(() => {
    if (!mySupplements || !supplements || !logEntries) return undefined
    return computeSupplementScore(mySupplements, supplements, logEntries)
  }, [mySupplements, supplements, logEntries])
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
  // `?? ''` for the same reason as lib/mealSuggestions.ts: these rows come
  // from IndexedDB, where the declared type is not a runtime guarantee.
  const existing = await db.supplements.filter((s) => (s.name ?? '').trim().toLowerCase() === normalized).first()
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
  // In a transaction, and deleting *all* matches rather than the first.
  // Read-then-write outside one let two taps ~100ms apart both see "not
  // checked" and both insert — the compound index isn't declared unique — so a
  // once-daily supplement reported 2/1 slots, i.e. 200% adherence, and needed
  // two taps to clear again. The transaction serialises the pair; deleting all
  // matches also repairs any duplicate a previous version already wrote.
  await db.transaction('rw', db.supplementLog, async () => {
    const existing = await db.supplementLog
      .where('[mySupplementId+date+timeOfDay]')
      .equals([mySupplementId, date, timeOfDay])
      .toArray()
    if (existing.length > 0) {
      await db.supplementLog.bulkDelete(existing.map((e) => e.id))
    } else {
      await db.supplementLog.add({ id: newSupplementLogId(), mySupplementId, date, timeOfDay, checkedAt: Date.now() })
    }
  })
}
