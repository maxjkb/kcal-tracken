import { db, type Supplement } from './db'

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * A lenient matcher for one name or alias: strips any parenthetical
 * qualifier (e.g. "Kreatin" out of "Kreatin (Monohydrat)", so someone
 * doesn't have to type the qualifier to be recognized), tolerates a space
 * where the catalog spells a hyphen or vice versa (e.g. "Omega 3" matching
 * the catalog's "Omega-3"), and now tolerates NO separator at all (e.g.
 * "VitaminD" matching "Vitamin D") — German compounds words together often
 * enough that requiring a space/hyphen was its own source of misses.
 * Returns null for anything too short to search for reliably — a 1-2
 * letter core would match all sorts of unrelated text.
 */
function buildMatcher(text: string): RegExp | null {
  const core = text.split('(')[0].trim()
  if (core.length < 3) return null
  const pattern = escapeRegExp(core).replace(/[\s-]+/g, '[\\s-]*')
  return new RegExp(`\\b${pattern}\\b`, 'i')
}

/**
 * Every string a mention of this supplement in someone's own words could
 * plausibly look like: its catalog name, plus `aliases` — an English name
 * ("Calcium" for "Kalzium"), a common short form ("B12" for "Vitamin
 * B12"), or an alternate spelling ("Creatin" for "Kreatin") that the name
 * alone, however leniently matched, would never catch.
 */
function matchStringsFor(s: Supplement): string[] {
  return [s.name, ...(s.aliases ?? [])]
}

/**
 * Finds catalog supplements mentioned by name (or known alias) in freeform
 * meal-entry text — "Frühstück, dazu noch Kreatin und Vitamin D genommen"
 * recognizes both.
 *
 * A plain lenient regex rather than another AI call: this runs on every
 * meal save, so it has to be instant and free, and matching against a
 * fixed, known list of ~90 entries (plus their aliases) doesn't need a
 * language model — it needs to not miss "kreatin" for capitalization,
 * "omega 3" for a hyphen, or "Calcium" for "Kalzium", which the matcher
 * and alias list above already handle.
 */
export function matchSupplementsInText(text: string, catalog: Supplement[]): Supplement[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  return catalog.filter((s) => matchStringsFor(s).some((candidate) => buildMatcher(candidate)?.test(trimmed)))
}

/** One catalog supplement recognized in a meal's text, plus whether it's already on the user's list. */
export interface SupplementMatch {
  supplement: Supplement
  /** Set when this supplement is already on the user's list — confirming then just checks it off instead of adding it again. */
  existingId: string | null
}

/**
 * matchSupplementsInText scoped down to what's actually worth proposing:
 * drops anything already checked off for this date, so re-saving an
 * unchanged description (editing a meal, or the draft-restore autosave)
 * doesn't re-prompt for something the user already confirmed once.
 */
export async function findUnconfirmedSupplementMatches(text: string, dateKey: string): Promise<SupplementMatch[]> {
  const [catalog, mySupplements, logToday] = await Promise.all([
    db.supplements.toArray(),
    db.mySupplements.toArray(),
    db.supplementLog.where('date').equals(dateKey).toArray(),
  ])
  const checkedMySupplementIds = new Set(logToday.map((e) => e.mySupplementId))
  const mySupplementBySupplementId = new Map(mySupplements.map((m) => [m.supplementId, m]))

  return matchSupplementsInText(text, catalog)
    .map((supplement) => ({ supplement, existing: mySupplementBySupplementId.get(supplement.id) ?? null }))
    .filter(({ existing }) => !existing || !checkedMySupplementIds.has(existing.id))
    .map(({ supplement, existing }) => ({ supplement, existingId: existing?.id ?? null }))
}
