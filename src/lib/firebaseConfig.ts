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
 * Firebase's console gives you a full code snippet to copy-paste — import
 * statements, comments, `const firebaseConfig = { apiKey: "...", ... };`,
 * then `initializeApp(...)`/`getAnalytics(...)` calls — not just the bare
 * object literal, and not valid JSON (unquoted keys). This turns the pasted
 * text into a usable config without eval()'ing it.
 *
 * Finds the smallest {...} block containing "apiKey" rather than grabbing
 * from the very first "{" in the text to the very last "}" — a Firebase
 * config object never nests braces, but the surrounding snippet does (e.g.
 * `import { initializeApp } from "..."` has its own earlier "{"), so a
 * first-to-last match would swallow the unrelated import/code lines too and
 * fail to parse.
 */
export function parsePastedFirebaseConfig(text: string): FirebaseWebConfig | null {
  const match = text.match(/\{[^{}]*apiKey[^{}]*\}/)
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
