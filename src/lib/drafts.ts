/**
 * Short-lived rescue copies of half-filled sheet forms.
 *
 * Sheets no longer have an "✕" button — they close via the handle or a swipe
 * down, which is a much easier gesture to trigger by accident. Losing several
 * minutes of typing (or a dictated description) to a stray swipe would be a
 * genuinely bad outcome, so every editor sheet writes its in-progress state
 * here on unmount and offers it back when the same sheet is reopened.
 *
 * Deliberately short-lived: a draft is only a rescue from an accident that
 * just happened, not a second, competing source of truth for saved data.
 * After TTL_MS it's gone, so reopening an editor an hour later always starts
 * from the real record rather than silently resurrecting a stale edit.
 *
 * sessionStorage, not localStorage: a draft should not outlive the browsing
 * session either. It's also the storage that survives a sheet unmount and a
 * route change while staying invisible in the Dexie/Firestore data the user
 * actually owns — nothing here ever syncs.
 */

const PREFIX = 'kcal-tracker:draft:'
const TTL_MS = 3 * 60 * 1000

interface StoredDraft<T> {
  savedAt: number
  data: T
}

/**
 * Stable key per editable entity, so reopening *the same* meal offers its own
 * draft back and never another one's. New (unsaved) entities share one key
 * per kind — there can only be one in flight at a time.
 */
export function draftKey(kind: 'meal' | 'recipe' | 'supplement', id?: string): string {
  return `${PREFIX}${kind}:${id ?? 'new'}`
}

/**
 * Returns false when the draft could not be stored — private mode, or a
 * payload over quota (a meal photo's data URL runs to megabytes). Callers that
 * carry something that large can react by retrying with it stripped out: a
 * draft holding everything but the photo still rescues the typing, which is
 * the part that can't be redone in one tap.
 */
export function saveDraft<T>(key: string, data: T): boolean {
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data } satisfies StoredDraft<T>))
    return true
  } catch {
    // Never rethrow: a lost rescue copy must not break the editor it exists to protect.
    return false
  }
}

/** Returns the draft if one exists and is still fresh; clears and returns null otherwise. */
export function loadDraft<T>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredDraft<T>
    if (!parsed || typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > TTL_MS) {
      clearDraft(key)
      return null
    }
    return parsed.data
  } catch {
    clearDraft(key)
    return null
  }
}

/** Call after a successful save — the real record is now the source of truth. */
export function clearDraft(key: string): void {
  try {
    window.sessionStorage.removeItem(key)
  } catch {
    // Same reasoning as saveDraft.
  }
}
