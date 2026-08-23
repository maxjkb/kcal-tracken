/**
 * Requests "persistent" storage from the browser (Storage API) so the
 * origin's localStorage/IndexedDB — including the Gemini API key and all
 * logged meals — is exempt from the browser's automatic storage eviction
 * under disk pressure or long inactivity. Free, built into the browser, no
 * backend involved. Best-effort: not every browser supports or grants it,
 * so callers must not assume success.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  try {
    if (await navigator.storage.persisted?.()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function isStoragePersisted(): Promise<boolean | null> {
  if (!navigator.storage?.persisted) return null
  try {
    return await navigator.storage.persisted()
  } catch {
    return null
  }
}
