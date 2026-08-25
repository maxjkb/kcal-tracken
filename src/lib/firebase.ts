import type { FirebaseApp } from 'firebase/app'
import type { Auth, User } from 'firebase/auth'
import type { Firestore } from 'firebase/firestore'
import type * as FirestoreApi from 'firebase/firestore'
import { getFirebaseConfig } from './firebaseConfig'
import { recordUsage } from './usageQuota'

const EMAIL_STORAGE_KEY = 'kcal-tracker:sync-email-for-signin'

/**
 * Firebase Auth AND Firestore errors both carry a `.code` (e.g.
 * "auth/operation-not-allowed", or bare "permission-denied" for Firestore —
 * different SDKs, different code shapes, both handled by the same lookup
 * here) that pinpoints the actual cause far better than a generic guessed
 * message ever could. describeFirebaseError() below surfaces it, with a
 * plain-language hint for the codes anyone actually hits in practice — so a
 * failure becomes something diagnosable from the error text alone, instead
 * of every possible cause needing its own guess baked into the UI copy.
 * Covers both because sync.ts's own errors (startSync/resyncNow) are
 * Firestore-flavored but surface through the same SyncSettingsPage catches
 * as the Auth ones.
 */
const FIREBASE_ERROR_HINTS: Record<string, string> = {
  // Auth — sending/completing the sign-in link.
  'auth/operation-not-allowed':
    'Die Anmeldemethode "E-Mail-Link" ist im hinterlegten Firebase-Projekt nicht aktiviert (Firebase-Konsole → Authentication → Sign-in method → Email link aktivieren).',
  'auth/unauthorized-continue-uri':
    'Die Domain dieser App ist im hinterlegten Firebase-Projekt nicht als autorisierte Domain hinterlegt (Firebase-Konsole → Authentication → Settings → Authorized domains).',
  'auth/invalid-api-key': 'Der API-Key im hinterlegten Firebase-Projekt ist ungültig.',
  'auth/project-not-found': 'Das hinterlegte Firebase-Projekt existiert nicht (mehr) oder wurde gelöscht.',
  'auth/quota-exceeded':
    'Tageskontingent für Anmelde-E-Mails im Firebase-Projekt ist aufgebraucht (Google begrenzt das auf dem kostenlosen Spark-Tarif bewusst niedrig). Setzt sich automatisch zurück — meist innerhalb von 24 Stunden erneut versuchen, oder das Projekt auf den Blaze-Tarif umstellen für ein deutlich höheres Kontingent.',
  'auth/invalid-email': 'Das ist keine gültige E-Mail-Adresse.',
  'auth/network-request-failed': 'Netzwerkfehler — Internetverbindung prüfen.',
  'auth/too-many-requests': 'Zu viele Versuche in kurzer Zeit — bitte kurz warten und erneut versuchen.',
  'auth/expired-action-code': 'Dieser Anmeldelink ist abgelaufen.',
  'auth/invalid-action-code': 'Dieser Anmeldelink wurde schon verwendet oder ist ungültig.',
  // Firestore — the actual data sync (startSync/resyncNow in sync.ts).
  'permission-denied':
    'Die Firestore-Sicherheitsregeln im hinterlegten Firebase-Projekt blockieren den Zugriff (Firebase-Konsole → Firestore Database → Regeln).',
  unavailable: 'Firestore gerade nicht erreichbar (Netzwerk- oder Server-Problem) — meist von selbst gelöst, später erneut versuchen.',
  'resource-exhausted': 'Kontingent des Firestore-Projekts ausgeschöpft — später erneut versuchen oder Tarif prüfen.',
  unauthenticated: 'Anmeldung ist abgelaufen. Bitte einmal ab- und wieder anmelden.',
  'not-found': 'Angefragte Daten im Firebase-Projekt nicht gefunden (evtl. wurde die Firestore Database nicht angelegt).',
}

export function describeFirebaseError(err: unknown): string {
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : null
  const hint = code ? FIREBASE_ERROR_HINTS[code] : null
  if (hint) return `${hint} (${code})`
  const message = err instanceof Error ? err.message : String(err)
  return code ? `${message} (${code})` : message
}

let servicesPromise: Promise<{ auth: Auth; firestore: Firestore } | null> | null = null
let cachedConfigKey: string | null = null
let firestoreApiPromise: Promise<typeof FirestoreApi> | null = null

/**
 * Lazily loads the Firebase SDK (app/auth/firestore, ~250 KB) and creates
 * the app instance from the user's own pasted config — only once a config
 * actually exists, via dynamic import, so the SDK never enters the bundle
 * for anyone who hasn't set up sync. Returns null if no config is stored.
 */
export function getFirebaseServices(): Promise<{ auth: Auth; firestore: Firestore } | null> {
  const config = getFirebaseConfig()
  if (!config) return Promise.resolve(null)

  const key = JSON.stringify(config)
  if (!servicesPromise || cachedConfigKey !== key) {
    cachedConfigKey = key
    servicesPromise = (async () => {
      const [{ initializeApp }, { getAuth }, { initializeFirestore }] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore'),
      ])
      const app: FirebaseApp = initializeApp(config, key) // unique name so re-pasting a config doesn't collide with the previous app instance
      // ignoreUndefinedProperties: our local records (Meal.photo, Meal.note,
      // Meal.ingredients, …) commonly carry an explicit `undefined` rather
      // than omitting the key — Firestore otherwise rejects the entire write
      // with "Unsupported field value: undefined", which silently aborted
      // sync for any user with even one such meal/recipe.
      return { auth: getAuth(app), firestore: initializeFirestore(app, { ignoreUndefinedProperties: true }) }
    })()
  }
  return servicesPromise
}

/** Cached dynamic import of the Firestore query/document functions, for sync.ts — resolves only once a config exists. */
export function getFirestoreApi(): Promise<typeof FirestoreApi | null> {
  if (!getFirebaseConfig()) return Promise.resolve(null)
  if (!firestoreApiPromise) firestoreApiPromise = import('firebase/firestore')
  return firestoreApiPromise
}

export function onAuthChange(callback: (user: User | null) => void): () => void {
  if (!getFirebaseConfig()) {
    callback(null)
    return () => {}
  }
  let unsubscribe: (() => void) | null = null
  let cancelled = false
  Promise.all([getFirebaseServices(), import('firebase/auth')]).then(([services, authApi]) => {
    if (cancelled || !services) return
    unsubscribe = authApi.onAuthStateChanged(services.auth, callback)
  })
  return () => {
    cancelled = true
    unsubscribe?.()
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const services = await getFirebaseServices()
  return services?.auth.currentUser ?? null
}

/** The URL Firebase's email link points back to — the Sync settings page, where sign-in is completed. */
function signInRedirectUrl(): string {
  return window.location.href.split('#')[0] + '#/settings/sync'
}

/** Counter id for the sign-in emails this install has sent today — see lib/usageQuota.ts. */
export const SIGN_IN_EMAIL_USAGE_ID = 'firebase:signin-email'

export async function sendSignInLink(email: string): Promise<void> {
  const services = await getFirebaseServices()
  if (!services) throw new Error('Kein Firebase-Projekt hinterlegt.')
  const { sendSignInLinkToEmail } = await import('firebase/auth')
  await sendSignInLinkToEmail(services.auth, email, { url: signInRedirectUrl(), handleCodeInApp: true })
  // Counted only on success: a rejected send didn't consume the allowance, and
  // the whole point of the tally is to explain an auth/quota-exceeded before
  // it happens.
  recordUsage(SIGN_IN_EMAIL_USAGE_ID)
  window.localStorage.setItem(EMAIL_STORAGE_KEY, email)
}

/**
 * Checks whether `url` (defaults to the current page's own URL) is a
 * Firebase sign-in link. Accepts an explicit `url` so a link that arrived in
 * a different browsing context — e.g. tapped from Mail, which iOS always
 * opens in Safari, never directly in an installed "Add to Home Screen" app —
 * can be pasted back in and completed from within the installed app itself,
 * whose storage is otherwise completely isolated from Safari's on iOS.
 */
export async function isSignInLinkUrl(url: string = window.location.href): Promise<boolean> {
  const services = await getFirebaseServices()
  if (!services) return false
  const { isSignInWithEmailLink } = await import('firebase/auth')
  return isSignInWithEmailLink(services.auth, url)
}

export async function completeSignInFromLink(
  email: string,
  url: string = window.location.href,
): Promise<User> {
  const services = await getFirebaseServices()
  if (!services) throw new Error('Kein Firebase-Projekt hinterlegt.')
  const { signInWithEmailLink } = await import('firebase/auth')
  const credential = await signInWithEmailLink(services.auth, email, url)
  window.localStorage.removeItem(EMAIL_STORAGE_KEY)
  return credential.user
}

export function getStoredSignInEmail(): string | null {
  return window.localStorage.getItem(EMAIL_STORAGE_KEY)
}

/** True when running as an installed "Add to Home Screen" app rather than a regular browser tab. */
export function isRunningStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export async function signOutSync(): Promise<void> {
  const services = await getFirebaseServices()
  if (!services) return
  const { signOut } = await import('firebase/auth')
  await signOut(services.auth)
}
