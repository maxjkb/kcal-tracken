import type { Firestore } from 'firebase/firestore'
import { db, type Meal, type Recipe } from './db'
import { getFirebaseServices, getFirestoreApi, onAuthChange } from './firebase'
import type { BodyProfile } from './bodyProfile'

/**
 * Cross-device sync (Firebase Auth + Firestore, "bring your own project" —
 * see firebaseConfig.ts). Meals, recipes, the body profile and the Gemini
 * API key are all mirrored to `users/{uid}/…`.
 *
 * Local → remote pushes happen explicitly from saveMeal/deleteMeal/
 * saveRecipe/deleteRecipe/setBodyProfile (not via Dexie hooks) — so an
 * incoming remote change applied straight to Dexie by the listeners below
 * never re-triggers a push, no feedback-loop guard needed. Each write
 * still carries updatedAt for last-write-wins conflict resolution, which
 * matters for the reconciliation pass and for a remote change arriving
 * out of order.
 *
 * The actual `firebase/firestore` module is only ever dynamically imported
 * (via getFirestoreApi(), gated on a config existing) — so nothing here
 * pulls the Firebase SDK into the app's eagerly-loaded bundle for anyone
 * who hasn't set up sync.
 */

let currentUid: string | null = null
/** Set synchronously by startSync so a second, concurrent call can't slip past the currentUid check while the first is still awaiting. */
let startingUid: string | null = null
let unsubscribers: (() => void)[] = []
let statusListeners: (() => void)[] = []
let lastSyncError: string | null = null

export type SyncStatus = 'inactive' | 'syncing' | 'error'

function notifyStatus() {
  statusListeners.forEach((fn) => fn())
}

export function onSyncStatusChange(callback: () => void): () => void {
  statusListeners.push(callback)
  return () => {
    statusListeners = statusListeners.filter((fn) => fn !== callback)
  }
}

export function getSyncStatus(): SyncStatus {
  if (!currentUid) return 'inactive'
  return lastSyncError ? 'error' : 'syncing'
}

/** Human-readable reason for the last sync failure, if getSyncStatus() is 'error'. */
export function getSyncError(): string | null {
  return lastSyncError
}

// Reads/writes the body profile's and API key's localStorage entries directly
// (same keys as bodyProfile.ts/settings.ts) rather than importing their get/
// set functions — both modules import push*Change from this module to push on
// every local save, so importing back would create a circular dependency.
const BODY_PROFILE_KEY = 'kcal-tracker:body-profile'
const API_KEY_KEY = 'kcal-tracker:gemini-api-key'

function readLocalBodyProfile(): BodyProfile | null {
  try {
    const raw = localStorage.getItem(BODY_PROFILE_KEY)
    return raw ? (JSON.parse(raw) as BodyProfile) : null
  } catch {
    return null
  }
}

function readLocalApiKey(): string | null {
  try {
    return localStorage.getItem(API_KEY_KEY)
  } catch {
    return null
  }
}

/**
 * A deleted record, kept as a document rather than removed.
 *
 * Hard-deleting the remote document made deletions un-syncable: reconcile
 * treats "local record with no remote document" as something to upload, so a
 * device that was offline when the delete happened would push its stale copy
 * straight back into Firestore on its next launch — and the snapshot listener
 * then reinstated it everywhere. A record that has to be *absent* to be
 * deleted cannot survive a device that hasn't heard about it yet. A tombstone
 * carries the delete forward as a normal, timestamped change instead, so
 * last-write-wins resolves it like any other edit.
 */
interface Tombstone {
  id: string
  deleted: true
  updatedAt: number
}

function isTombstone(value: unknown): value is Tombstone {
  return typeof value === 'object' && value !== null && (value as { deleted?: unknown }).deleted === true
}

/** Called by saveMeal/deleteMeal right after the local write succeeds. No-op if sync isn't active. Fire-and-forget. */
export function pushMealChange(meal: Meal | null, id: string): void {
  if (!currentUid) return
  const uid = currentUid
  void (async () => {
    const [services, fs] = await Promise.all([getFirebaseServices(), getFirestoreApi()])
    if (!services || !fs) return
    const ref = fs.doc(services.firestore, 'users', uid, 'meals', id)
    await fs.setDoc(ref, meal ?? ({ id, deleted: true, updatedAt: Date.now() } satisfies Tombstone))
  })().catch(() => {})
}

/** Called by saveRecipe/deleteRecipe right after the local write succeeds. No-op if sync isn't active. Fire-and-forget. */
export function pushRecipeChange(recipe: Recipe | null, id: string): void {
  if (!currentUid) return
  const uid = currentUid
  void (async () => {
    const [services, fs] = await Promise.all([getFirebaseServices(), getFirestoreApi()])
    if (!services || !fs) return
    const ref = fs.doc(services.firestore, 'users', uid, 'recipes', id)
    await fs.setDoc(ref, recipe ?? ({ id, deleted: true, updatedAt: Date.now() } satisfies Tombstone))
  })().catch(() => {})
}

/** Called by setBodyProfile/clearBodyProfile right after the local write succeeds. No-op if sync isn't active. Fire-and-forget. */
export function pushProfileChange(profile: BodyProfile | null): void {
  if (!currentUid) return
  const uid = currentUid
  void (async () => {
    const [services, fs] = await Promise.all([getFirebaseServices(), getFirestoreApi()])
    if (!services || !fs) return
    const ref = fs.doc(services.firestore, 'users', uid, 'profile', 'main')
    const payload = profile ? { ...profile, updatedAt: Date.now() } : null
    await (payload ? fs.setDoc(ref, payload) : fs.deleteDoc(ref))
  })().catch(() => {})
}

/** Called by setApiKey/clearApiKey right after the local write succeeds. No-op if sync isn't active. Fire-and-forget. */
export function pushApiKeyChange(apiKey: string | null): void {
  if (!currentUid) return
  const uid = currentUid
  void (async () => {
    const [services, fs] = await Promise.all([getFirebaseServices(), getFirestoreApi()])
    if (!services || !fs) return
    const ref = fs.doc(services.firestore, 'users', uid, 'settings', 'geminiApiKey')
    await (apiKey ? fs.setDoc(ref, { apiKey, updatedAt: Date.now() }) : fs.deleteDoc(ref))
  })().catch(() => {})
}

async function reconcileMeals(fsApi: typeof import('firebase/firestore'), fs: Firestore, uid: string) {
  const col = fsApi.collection(fs, 'users', uid, 'meals')
  const [localItems, remoteSnap] = await Promise.all([db.meals.toArray(), fsApi.getDocs(col)])
  const remoteById = new Map(remoteSnap.docs.map((d) => [d.id, d.data() as Meal | Tombstone]))
  const localById = new Map(localItems.map((item) => [item.id, item]))

  const batch = fsApi.writeBatch(fs)
  let hasWrites = false
  for (const local of localItems) {
    const remote = remoteById.get(local.id)
    // A tombstone that is at least as new as the local copy wins: this device
    // simply hadn't heard about the delete yet.
    if (isTombstone(remote) && remote.updatedAt >= local.updatedAt) continue
    if (!remote || local.updatedAt > remote.updatedAt) {
      batch.set(fsApi.doc(col, local.id), local)
      hasWrites = true
    }
  }
  if (hasWrites) await batch.commit()

  for (const [id, remote] of remoteById) {
    const local = localById.get(id)
    if (isTombstone(remote)) {
      if (local && remote.updatedAt >= local.updatedAt) await db.meals.delete(id)
      continue
    }
    if (!local || remote.updatedAt > local.updatedAt) {
      await db.meals.put(remote)
    }
  }
}

async function reconcileRecipes(fsApi: typeof import('firebase/firestore'), fs: Firestore, uid: string) {
  const col = fsApi.collection(fs, 'users', uid, 'recipes')
  const [localItems, remoteSnap] = await Promise.all([db.recipes.toArray(), fsApi.getDocs(col)])
  const remoteById = new Map(remoteSnap.docs.map((d) => [d.id, d.data() as Recipe]))
  const localById = new Map(localItems.map((r) => [r.id, r]))

  const batch = fsApi.writeBatch(fs)
  let hasWrites = false
  for (const local of localItems) {
    const remote = remoteById.get(local.id)
    if (!remote || local.updatedAt > remote.updatedAt) {
      batch.set(fsApi.doc(col, local.id), local)
      hasWrites = true
    }
  }
  if (hasWrites) await batch.commit()

  for (const [id, remote] of remoteById) {
    const local = localById.get(id)
    if (!local || remote.updatedAt > local.updatedAt) {
      await db.recipes.put(remote)
    }
  }
}

async function reconcileProfile(fsApi: typeof import('firebase/firestore'), fs: Firestore, uid: string) {
  const ref = fsApi.doc(fs, 'users', uid, 'profile', 'main')
  const snap = await fsApi.getDoc(ref)
  const remote = snap.exists() ? (snap.data() as BodyProfile & { updatedAt: number }) : null
  const local = readLocalBodyProfile()

  if (remote && !local) {
    const { updatedAt: _updatedAt, ...profile } = remote
    localStorage.setItem(BODY_PROFILE_KEY, JSON.stringify(profile))
  } else if (local && !remote) {
    pushProfileChange(local)
  }
  // Both present: no reliable local timestamp to compare against — leave as-is
  // rather than guess, matching this feature's documented simplification for
  // the rarely-changing profile (see SyncSettingsPage's explanatory text).
}

async function reconcileApiKey(fsApi: typeof import('firebase/firestore'), fs: Firestore, uid: string) {
  const ref = fsApi.doc(fs, 'users', uid, 'settings', 'geminiApiKey')
  const snap = await fsApi.getDoc(ref)
  const remote = snap.exists() ? (snap.data() as { apiKey: string; updatedAt: number }) : null
  const local = readLocalApiKey()

  if (remote && !local) {
    localStorage.setItem(API_KEY_KEY, remote.apiKey)
  } else if (local && !remote) {
    pushApiKeyChange(local)
  }
  // Both present: same simplification as the body profile above — no local
  // timestamp to compare, so an existing key on either side is left as-is
  // rather than guessed at.
}

export async function startSync(uid: string): Promise<void> {
  // Claimed synchronously, before the first await. The sign-in flow calls this
  // twice — once from the settings page's own handler, once from the global
  // onAuthChange listener — and `currentUid` was only assigned two awaits in,
  // so both calls sailed past it. Each then registered its own pair of
  // snapshot listeners while `unsubscribers` kept only the second pair, so
  // signing out left an orphaned listener writing remote documents into the
  // local database for the rest of the session.
  if (startingUid === uid || currentUid === uid) return
  startingUid = uid

  const [services, fsApi] = await Promise.all([getFirebaseServices(), getFirestoreApi()])
  if (!services || !fsApi) {
    startingUid = null
    return
  }
  currentUid = uid
  lastSyncError = null
  notifyStatus()

  const fs = services.firestore
  try {
    await Promise.all([
      reconcileMeals(fsApi, fs, uid),
      reconcileRecipes(fsApi, fs, uid),
      reconcileProfile(fsApi, fs, uid),
      reconcileApiKey(fsApi, fs, uid),
    ])

    const unsubMeals = fsApi.onSnapshot(fsApi.collection(fs, 'users', uid, 'meals'), (snap) => {
      for (const change of snap.docChanges()) {
        if (change.type === 'removed') {
          void db.meals.delete(change.doc.id)
          continue
        }
        const data = change.doc.data() as Meal | Tombstone
        if (isTombstone(data)) {
          void db.meals.delete(data.id)
          continue
        }
        const remote = data
        void db.meals.get(remote.id).then((local) => {
          if (!local || remote.updatedAt >= local.updatedAt) void db.meals.put(remote)
        })
      }
    })

    const unsubRecipes = fsApi.onSnapshot(fsApi.collection(fs, 'users', uid, 'recipes'), (snap) => {
      for (const change of snap.docChanges()) {
        if (change.type === 'removed') {
          void db.recipes.delete(change.doc.id)
          continue
        }
        const data = change.doc.data() as Recipe | Tombstone
        if (isTombstone(data)) {
          void db.recipes.delete(data.id)
          continue
        }
        const remote = data
        void db.recipes.get(remote.id).then((local) => {
          if (!local || remote.updatedAt >= local.updatedAt) void db.recipes.put(remote)
        })
      }
    })

    unsubscribers = [unsubMeals, unsubRecipes]
  } catch (err) {
    lastSyncError = err instanceof Error ? err.message : String(err)
    notifyStatus()
    throw err
  } finally {
    startingUid = null
  }
}

export function stopSync(): void {
  unsubscribers.forEach((fn) => fn())
  unsubscribers = []
  currentUid = null
  startingUid = null
  notifyStatus()
}

/** Re-runs the full reconciliation pass on demand (e.g. a manual "Jetzt synchronisieren" button, or to pick up a bulk backup-import that bypassed the per-write push). */
export async function resyncNow(): Promise<void> {
  if (!currentUid) return
  const [services, fsApi] = await Promise.all([getFirebaseServices(), getFirestoreApi()])
  if (!services || !fsApi) return
  try {
    await Promise.all([
      reconcileMeals(fsApi, services.firestore, currentUid),
      reconcileRecipes(fsApi, services.firestore, currentUid),
      reconcileProfile(fsApi, services.firestore, currentUid),
      reconcileApiKey(fsApi, services.firestore, currentUid),
    ])
    lastSyncError = null
    notifyStatus()
  } catch (err) {
    lastSyncError = err instanceof Error ? err.message : String(err)
    notifyStatus()
    throw err
  }
}

/** Resumes sync automatically if the user is already signed in from a previous visit (e.g. after a page reload). Call once at app startup. */
export function initSyncIfSignedIn(): void {
  onAuthChange((user) => {
    if (user && !currentUid) startSync(user.uid).catch(() => {}) // failure already recorded in getSyncStatus()/getSyncError()
    else if (!user && currentUid) stopSync()
  })
}
