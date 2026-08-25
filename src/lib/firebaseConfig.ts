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

/**
 * Tracke's own Firebase project ("tracke-3d86d"), baked in as the built-in
 * default so sync works out of the box on any fresh browser/device without
 * re-pasting the config every time — the paste flow on the Sync settings
 * page still exists underneath as an optional override, for anyone who'd
 * rather point the app at a different Firebase project of their own.
 *
 * A Firebase web `apiKey` is an app identifier, not a secret — it's meant to
 * ship in client-side bundles (Firebase's own docs are explicit about this);
 * access is actually controlled server-side by Firestore Security Rules and
 * the Authentication provider settings, not by hiding this value. It would
 * already be visible in this app's deployed network requests either way, so
 * committing it here adds no real exposure.
 */
const DEFAULT_FIREBASE_CONFIG: FirebaseWebConfig = {
  apiKey: 'AIzaSyCXw2PeNjIRVvEfPGdz98D5tHCJyzBHfhk',
  authDomain: 'tracke-3d86d.firebaseapp.com',
  projectId: 'tracke-3d86d',
  storageBucket: 'tracke-3d86d.firebasestorage.app',
  messagingSenderId: '994616886488',
  appId: '1:994616886488:web:549e630d64ab486be683ad',
}

function readStoredFirebaseConfig(): FirebaseWebConfig | null {
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

/** The config actually in effect: a pasted override if one is stored, otherwise the built-in default above. Never null. */
export function getFirebaseConfig(): FirebaseWebConfig {
  return readStoredFirebaseConfig() ?? DEFAULT_FIREBASE_CONFIG
}

/** Whether the in-effect config is a user-pasted override rather than the built-in default — drives the Sync settings page's "Entfernen" vs. "Anderes Projekt" wording. */
export function hasCustomFirebaseConfig(): boolean {
  return readStoredFirebaseConfig() !== null
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
