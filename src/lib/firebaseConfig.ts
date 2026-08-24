const STORAGE_KEY = 'kcal-tracker:firebase-config'

/** The subset of a Firebase web config actually needed for Auth + Firestore. */
export interface FirebaseWebConfig {
  apiKey: string
  authDomain: string
  projectId: string
  appId: string
  storageBucket?: string
  messagingSenderId?: string
}

export function getFirebaseConfig(): FirebaseWebConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.apiKey && parsed?.projectId && parsed?.appId) return parsed as FirebaseWebConfig
    return null
  } catch {
    return null
  }
}

export function setFirebaseConfig(config: FirebaseWebConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function clearFirebaseConfig(): void {
  localStorage.removeItem(STORAGE_KEY)
}

/**
 * Firebase's console gives you a JS object literal to copy-paste, e.g.
 * `const firebaseConfig = { apiKey: "...", authDomain: "...", ... };` — not
 * valid JSON (unquoted keys). This turns the pasted text into a usable
 * config without eval()'ing it: pulls out the `{ ... }` block, quotes bare
 * identifier keys and normalizes single quotes to double, then parses it
 * as plain JSON.
 */
export function parsePastedFirebaseConfig(text: string): FirebaseWebConfig | null {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null

  let body = match[0]
  body = body.replace(/'/g, '"')
  body = body.replace(/([{,]\s*)([A-Za-z0-9_$]+)\s*:/g, '$1"$2":')
  body = body.replace(/,(\s*[}\]])/g, '$1') // trailing commas

  try {
    const obj = JSON.parse(body)
    if (obj && typeof obj === 'object' && obj.apiKey && obj.projectId && obj.appId) {
      return obj as FirebaseWebConfig
    }
    return null
  } catch {
    return null
  }
}
