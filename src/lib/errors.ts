/**
 * Shared translation from a raw save/write failure into something a
 * non-technical user can actually act on — used by every editor that
 * writes to IndexedDB (MealEditor, RecipeEditor, SupplementFormSheet).
 * Was three near-identical copies before; consolidated here so a future
 * fix (e.g. a new known error type) lands everywhere at once instead of
 * needing to be repeated by hand in each editor.
 */

/** The one browser-native error IndexedDB/localStorage writes throw when the device is genuinely out of storage. */
function isQuotaExceeded(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'QuotaExceededError'
}

/**
 * `itemLabel` names what failed to save (e.g. "Mahlzeit", "Rezept",
 * "Supplement") — only used in the generic fallback branch, where the raw
 * error message is shown alongside it since there's no more specific
 * translation available for it.
 */
export function describeSaveError(err: unknown, itemLabel: string): string {
  if (isQuotaExceeded(err)) {
    return 'Speicherplatz auf dem Gerät ist voll. Lösche alte Fotos/Einträge oder gib Speicher frei und versuche es erneut.'
  }
  const message = err instanceof Error ? err.message : String(err)
  return `${itemLabel} konnte nicht gespeichert werden (${message}). Bitte erneut versuchen.`
}
