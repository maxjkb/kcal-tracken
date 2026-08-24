import type { FirebaseApp } from 'firebase/app'
import type { Auth, User } from 'firebase/auth'
import type { Firestore } from 'firebase/firestore'
import type * as FirestoreApi from 'firebase/firestore'
import { getFirebaseConfig } from './firebaseConfig'

const EMAIL_STORAGE_KEY = 'kcal-tracker:sync-email-for-signin'

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
      const [{ initializeApp }, { getAuth }, { getFirestore }] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore'),
      ])
      const app: FirebaseApp = initializeApp(config, key) // unique name so re-pasting a config doesn't collide with the previous app instance
      return { auth: getAuth(app), firestore: getFirestore(app) }
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

export async function sendSignInLink(email: string): Promise<void> {
  const services = await getFirebaseServices()
  if (!services) throw new Error('Kein Firebase-Projekt hinterlegt.')
  const { sendSignInLinkToEmail } = await import('firebase/auth')
  await sendSignInLinkToEmail(services.auth, email, { url: signInRedirectUrl(), handleCodeInApp: true })
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
