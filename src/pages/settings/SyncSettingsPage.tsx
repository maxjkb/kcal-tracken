import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { SettingsBackHeader } from '../../components/SettingsBackHeader'
import { SavedToast } from '../../components/SavedToast'
import { useSavedToast } from '../../hooks/useSavedToast'
import {
  clearFirebaseConfig,
  getFirebaseConfig,
  parsePastedFirebaseConfig,
  setFirebaseConfig,
} from '../../lib/firebaseConfig'
import {
  completeSignInFromLink,
  getStoredSignInEmail,
  isSignInLinkUrl,
  onAuthChange,
  sendSignInLink,
  signOutSync,
} from '../../lib/firebase'
import { getSyncStatus, onSyncStatusChange, resyncNow, startSync, stopSync } from '../../lib/sync'

/**
 * "Bring your own Firebase project" sync setup — same trust model as the
 * Gemini API key page: nothing here is Anthropic- or app-hosted, the user
 * creates their own free Firebase project and pastes its web config in.
 * Passwordless email-link sign-in; once signed in on two devices with the
 * same address, meals/recipes/body profile sync between them. The Gemini
 * API key intentionally stays device-local and is never synced.
 */
export function SyncSettingsPage() {
  const [config, setConfig] = useState(getFirebaseConfig())
  const [configText, setConfigText] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [linkSent, setLinkSent] = useState(false)
  const [completingLink, setCompletingLink] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, forceUpdate] = useState(0)
  const { message, flash } = useSavedToast()

  useEffect(() => onAuthChange(setUser), [config])
  useEffect(() => onSyncStatusChange(() => forceUpdate((n) => n + 1)), [])
  useEffect(() => {
    if (config) void isSignInLinkUrl().then(setCompletingLink)
  }, [config])

  // If we opened the app from the sign-in email link on the same device/browser
  // it was requested from, the address is still in localStorage — complete
  // sign-in automatically without asking again.
  useEffect(() => {
    if (!completingLink) return
    const stored = getStoredSignInEmail()
    if (!stored) return
    completeSignInFromLink(stored)
      .then((signedInUser) => {
        setCompletingLink(false)
        void startSync(signedInUser.uid)
        flash('Angemeldet.')
      })
      .catch(() => setError('Anmeldelink ungültig oder abgelaufen. Bitte einen neuen Link anfordern.'))
  }, [completingLink, flash])

  function handleSaveConfig() {
    const parsed = parsePastedFirebaseConfig(configText)
    if (!parsed) {
      setError(
        'Konnte die eingefügte Konfiguration nicht lesen. Bitte das komplette firebaseConfig-Objekt aus der Firebase-Konsole einfügen.',
      )
      return
    }
    setFirebaseConfig(parsed)
    setConfig(parsed)
    setConfigText('')
    setError(null)
    flash('Firebase-Projekt hinterlegt.')
  }

  function handleRemoveConfig() {
    stopSync()
    clearFirebaseConfig()
    setConfig(null)
    setUser(null)
    flash('Firebase-Projekt entfernt.')
  }

  async function handleSendLink() {
    if (!email.trim()) return
    setBusy(true)
    setError(null)
    try {
      await sendSignInLink(email.trim())
      setLinkSent(true)
    } catch {
      setError(
        'Anmeldelink konnte nicht gesendet werden. Prüfe, ob in der Firebase-Konsole unter Authentication die Anmeldemethode "E-Mail-Link" aktiviert ist.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleConfirmEmail() {
    if (!confirmEmail.trim()) return
    setBusy(true)
    setError(null)
    try {
      const signedInUser = await completeSignInFromLink(confirmEmail.trim())
      setCompletingLink(false)
      void startSync(signedInUser.uid)
      flash('Angemeldet.')
    } catch {
      setError('Anmeldelink ungültig oder abgelaufen. Bitte einen neuen Link anfordern.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSignOut() {
    await signOutSync()
    stopSync()
    setUser(null)
  }

  async function handleResync() {
    setBusy(true)
    await resyncNow().catch(() => {})
    setBusy(false)
    flash('Synchronisiert.')
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <SettingsBackHeader title="Sync" />

      <section className="mb-6 rounded-3xl bg-surface p-4 shadow-sm shadow-black/5">
        <h2 className="mb-1 text-sm font-semibold text-ink">Firebase-Projekt</h2>
        <p className="mb-3 text-xs text-ink-soft">
          Kostenlose geräteübergreifende Synchronisation über dein eigenes Firebase-Projekt (Google,
          Gratis-Kontingent). Erstelle unter{' '}
          <a
            href="https://console.firebase.google.com"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-accent underline"
          >
            console.firebase.google.com
          </a>{' '}
          ein neues Projekt, füge eine Web-App hinzu, aktiviere unter <strong>Authentication</strong> die
          Anmeldemethode <strong>E-Mail-Link</strong> sowie eine <strong>Firestore Database</strong>, und füge
          hier die Web-Konfiguration ein (Projekteinstellungen → deine Web-App → "SDK-Setup und
          Konfiguration"). Wird nur lokal in deinem Browser gespeichert.
        </p>

        {config ? (
          <div className="flex items-center justify-between rounded-xl bg-bg px-3 py-2.5">
            <span className="text-sm text-ink">
              Projekt: <span className="font-medium">{config.projectId}</span>
            </span>
            <button type="button" onClick={handleRemoveConfig} className="text-xs font-medium text-red-500">
              Entfernen
            </button>
          </div>
        ) : (
          <>
            <textarea
              value={configText}
              onChange={(e) => setConfigText(e.target.value)}
              placeholder={'const firebaseConfig = {\n  apiKey: "…",\n  authDomain: "…",\n  projectId: "…",\n  …\n};'}
              rows={5}
              className="w-full resize-none rounded-xl border border-line bg-bg px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
            />
            <button
              onClick={handleSaveConfig}
              className="glass-accent mt-3 w-full rounded-xl py-2.5 text-sm font-semibold"
            >
              Speichern
            </button>
            {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
          </>
        )}
      </section>

      {config && (
        <section className="mb-6 rounded-3xl bg-surface p-4 shadow-sm shadow-black/5">
          <h2 className="mb-1 text-sm font-semibold text-ink">Anmeldung</h2>

          {completingLink ? (
            <>
              <p className="mb-3 text-xs text-ink-soft">
                Anmeldelink erkannt. Zur Bestätigung bitte die E-Mail-Adresse eingeben, an die der Link
                gesendet wurde.
              </p>
              <input
                type="email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder="deine@email.de"
                className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
              />
              <button
                onClick={handleConfirmEmail}
                disabled={busy}
                className="glass-accent mt-3 w-full rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                Anmeldung abschließen
              </button>
            </>
          ) : user ? (
            <>
              <p className="mb-3 text-sm text-ink">
                Angemeldet als <span className="font-medium">{user.email}</span>.{' '}
                <span className="text-xs text-ink-soft">
                  {getSyncStatus() === 'syncing' ? 'Synchronisation aktiv.' : 'Wird verbunden…'}
                </span>
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleResync}
                  disabled={busy}
                  className="flex-1 rounded-xl bg-bg py-2.5 text-sm font-medium text-ink-soft hover:bg-line disabled:opacity-50"
                >
                  Jetzt synchronisieren
                </button>
                <button
                  onClick={handleSignOut}
                  className="flex-1 rounded-xl bg-bg py-2.5 text-sm font-medium text-red-500 hover:bg-line"
                >
                  Abmelden
                </button>
              </div>
            </>
          ) : linkSent ? (
            <p className="text-sm text-ink">
              Anmeldelink an <span className="font-medium">{email}</span> gesendet. E-Mail öffnen und den
              Link auf diesem Gerät antippen, um die Anmeldung abzuschließen.
            </p>
          ) : (
            <>
              <p className="mb-3 text-xs text-ink-soft">
                Anmeldung ohne Passwort per Link per E-Mail. Auf jedem Gerät, das synchronisieren soll, mit
                derselben E-Mail-Adresse anmelden.
              </p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="deine@email.de"
                className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
              />
              <button
                onClick={handleSendLink}
                disabled={busy}
                className="glass-accent mt-3 w-full rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                Anmeldelink senden
              </button>
            </>
          )}

          {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
        </section>
      )}

      {config && user && (
        <p className="mb-6 px-1 text-xs text-ink-soft">
          Synchronisiert werden Mahlzeiten, Rezepte sowie Körperwerte & Ziele. Der Gemini-API-Key bleibt
          bewusst geräteweise lokal gespeichert und wird nicht synchronisiert.
        </p>
      )}

      <SavedToast message={message} />
    </div>
  )
}
