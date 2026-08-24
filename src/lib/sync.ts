import type { Firestore } from 'firebase/firestore'
import { db, type Meal, type Recipe } from './db'
import { getFirebaseServices, getFirestoreApi, onAuthChange } from './firebase'
import type { BodyProfile } from './bodyProfile'

/**
 * Cross-device sync (Firebase Auth + Firestore, "bring your own project" —
 * see firebaseConfig.ts). Meals, recipes and the body profile are mirrored
 * to `users/{uid}/…`; the Gemini API key deliberately stays local-only,
 * same as before sync existed.
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
let unsubscribers: (() => void)[] = []
let statusListeners: (() => void)[] = []

export type SyncStatus = 'inactive' | 'syncing'

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
  return currentUid ? 'syncing' : 'inactive'
}

// Reads/writes the body profile's localStorage entry directly (same key as
// bodyProfile.ts) rather than importing its get/set functions — bodyProfile.ts
// imports pushProfileChange from this module to push on every local save, so
// importing back would create a circular module dependency.
const BODY_PROFILE_KEY = 'kcal-tracker:body-profile'

function readLocalBodyProfile(): BodyProfile | null {
  try {
    const raw = localStorage.getItem(BODY_PROFILE_KEY)
    return raw ? (JSON.parse(raw) as BodyProfile) : null
  } catch {
    return null
  }
}

/** Called by saveMeal/deleteMeal right after the local write succeeds. No-op if sync isn't active. Fire-and-forget. */
export function pushMealChange(meal: Meal | null, id: string): void {
  if (!currentUid) return
  const uid = currentUid
  void (async () => {
    const [services, fs] = await Promise.all([getFirebaseServices(), getFirestoreApi()])
    if (!services || !fs) return
    const ref = fs.doc(services.firestore, 'users', uid, 'meals', id)
    await (meal ? fs.setDoc(ref, meal) : fs.deleteDoc(ref))
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
    await (recipe ? fs.setDoc(ref, recipe) : fs.deleteDoc(ref))
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

async function reconcileMeals(fsApi: typeof import('firebase/firestore'), fs: Firestore, uid: string) {
  const col = fsApi.collection(fs, 'users', uid, 'meals')
  const [localItems, remoteSnap] = await Promise.all([db.meals.toArray(), fsApi.getDocs(col)])
  const remoteById = new Map(remoteSnap.docs.map((d) => [d.id, d.data() as Meal]))
  const localById = new Map(localItems.map((m) => [m.id, m]))

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

export async function startSync(uid: string): Promise<void> {
  const [services, fsApi] = await Promise.all([getFirebaseServices(), getFirestoreApi()])
  if (!services || !fsApi) return
  currentUid = uid
  notifyStatus()

  const fs = services.firestore
  await Promise.all([
    reconcileMeals(fsApi, fs, uid),
    reconcileRecipes(fsApi, fs, uid),
    reconcileProfile(fsApi, fs, uid),
  ])

  const unsubMeals = fsApi.onSnapshot(fsApi.collection(fs, 'users', uid, 'meals'), (snap) => {
    for (const change of snap.docChanges()) {
      if (change.type === 'removed') {
        void db.meals.delete(change.doc.id)
        continue
      }
      const remote = change.doc.data() as Meal
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
      const remote = change.doc.data() as Recipe
      void db.recipes.get(remote.id).then((local) => {
        if (!local || remote.updatedAt >= local.updatedAt) void db.recipes.put(remote)
      })
    }
  })

  unsubscribers = [unsubMeals, unsubRecipes]
}

export function stopSync(): void {
  unsubscribers.forEach((fn) => fn())
  unsubscribers = []
  currentUid = null
  notifyStatus()
}

/** Re-runs the full reconciliation pass on demand (e.g. a manual "Jetzt synchronisieren" button, or to pick up a bulk backup-import that bypassed the per-write push). */
export async function resyncNow(): Promise<void> {
  if (!currentUid) return
  const [services, fsApi] = await Promise.all([getFirebaseServices(), getFirestoreApi()])
  if (!services || !fsApi) return
  await Promise.all([
    reconcileMeals(fsApi, services.firestore, currentUid),
    reconcileRecipes(fsApi, services.firestore, currentUid),
    reconcileProfile(fsApi, services.firestore, currentUid),
  ])
}

/** Resumes sync automatically if the user is already signed in from a previous visit (e.g. after a page reload). Call once at app startup. */
export function initSyncIfSignedIn(): void {
  onAuthChange((user) => {
    if (user && !currentUid) void startSync(user.uid)
    else if (!user && currentUid) stopSync()
  })
}
