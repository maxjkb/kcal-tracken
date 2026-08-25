import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { SettingsBackHeader } from '../../components/SettingsBackHeader'
import { SavedToast } from '../../components/SavedToast'
import { useSavedToast } from '../../hooks/useSavedToast'
import {
  clearFirebaseConfig,
  getFirebaseConfig,
  hasCustomFirebaseConfig,
  parsePastedFirebaseConfig,
  setFirebaseConfig,
} from '../../lib/firebaseConfig'
import {
  completeSignInFromLink,
  getStoredSignInEmail,
  isRunningStandalone,
  isSignInLinkUrl,
  onAuthChange,
  sendSignInLink,
  signOutSync,
} from '../../lib/firebase'
import { getSyncError, getSyncStatus, onSyncStatusChange, resyncNow, startSync, stopSync } from '../../lib/sync'

/**
 * Sync setup. Tracke ships with its own Firebase project baked in
 * (`lib/firebaseConfig.ts`'s built-in default), so sync works out of the
 * box on any fresh browser/device — no config to paste, just sign in below.
 * The "bring your own Firebase project" path from earlier still exists
 * underneath as an optional override ("Anderes Projekt"), same trust model
 * as the Gemini API key page: nothing there is Anthropic- or app-hosted,
 * it's the user's own free Firebase project, config kept only locally.
 * Passwordless email-link sign-in; once signed in on two devices with the
 * same address, meals/recipes/body profile/API key sync between them.
 *
 * iOS quirk this page works around: tapping the sign-in link in Mail always
 * opens Safari, never an installed "Add to Home Screen" app directly — and
 * Safari's storage is isolated from the installed app's, so completing
 * sign-in in Safari never reaches the installed app. The fallback: paste the
 * link's full address (copied from Safari's address bar) into the field
 * below, completing sign-in from within the installed app itself instead.
 */
export function SyncSettingsPage() {
  const [config, setConfig] = useState(getFirebaseConfig())
  const [isCustom, setIsCustom] = useState(hasCustomFirebaseConfig())
  const [showOverrideForm, setShowOverrideForm] = useState(false)
  const [configText, setConfigText] = useState('')
  const [configError, setConfigError] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [linkSent, setLinkSent] = useState(false)
  // The sign-in link URL currently being completed — either this page's own
  // URL (auto-detected on load) or one pasted in from another browsing
  // context (see the iOS note above). Null when no link is being completed.
  const [linkToComplete, setLinkToComplete] = useState<string | null>(null)
  const [confirmEmail, setConfirmEmail] = useState('')
  const [pasteInput, setPasteInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, forceUpdate] = useState(0)
  const { message, flash } = useSavedToast()

  useEffect(() => onAuthChange(setUser), [config])
  useEffect(() => onSyncStatusChange(() => forceUpdate((n) => n + 1)), [])
  useEffect(() => {
    if (config) void isSignInLinkUrl().then((isLink) => isLink && setLinkToComplete(window.location.href))
  }, [config])

  // If we opened the app from the sign-in email link on the same device/browser
  // it was requested from, the address is still in localStorage — complete
  // sign-in automatically without asking again.
  useEffect(() => {
    if (!linkToComplete) return
    const stored = getStoredSignInEmail()
    if (!stored) return
    completeSignInFromLink(stored, linkToComplete)
      .then(async (signedInUser) => {
        setLinkToComplete(null)
        try {
          await startSync(signedInUser.uid)
          flash('Angemeldet.')
        } catch {
          setError(
            'Angemeldet, aber die erste Synchronisation ist fehlgeschlagen. Bitte "Jetzt synchronisieren" versuchen.',
          )
        }
      })
      .catch(() => setError('Anmeldelink ungültig oder abgelaufen. Bitte einen neuen Link anfordern.'))
  }, [linkToComplete, flash])

  function handleSaveConfig() {
    const parsed = parsePastedFirebaseConfig(configText)
    if (!parsed) {
      setConfigError(
        'Konnte die eingefügte Konfiguration nicht lesen. Bitte das komplette firebaseConfig-Objekt aus der Firebase-Konsole einfügen.',
      )
      return
    }
    // Switching projects means switching backends — any session under the
    // previous project (default or custom) no longer applies.
    stopSync()
    setUser(null)
    setFirebaseConfig(parsed)
    setConfig(parsed)
    setIsCustom(true)
    setShowOverrideForm(false)
    setConfigText('')
    setConfigError(null)
    flash('Firebase-Projekt hinterlegt.')
  }

  /** Drops the custom override and reverts to Tracke's own built-in Firebase project. */
  function handleRemoveConfig() {
    stopSync()
    clearFirebaseConfig()
    setConfig(getFirebaseConfig())
    setIsCustom(false)
    setUser(null)
    flash('Eigenes Projekt entfernt — Standardprojekt wieder aktiv.')
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
    if (!confirmEmail.trim() || !linkToComplete) return
    setBusy(true)
    setError(null)
    try {
      const signedInUser = await completeSignInFromLink(confirmEmail.trim(), linkToComplete)
      setLinkToComplete(null)
      try {
        await startSync(signedInUser.uid)
        flash('Angemeldet.')
      } catch {
        setError(
          'Angemeldet, aber die erste Synchronisation ist fehlgeschlagen. Bitte "Jetzt synchronisieren" versuchen.',
        )
      }
    } catch {
      setError('Anmeldelink ungültig oder abgelaufen. Bitte einen neuen Link anfordern.')
    } finally {
      setBusy(false)
    }
  }

  async function handlePasteLink() {
    const url = pasteInput.trim()
    if (!url) return
    setBusy(true)
    setError(null)
    const valid = await isSignInLinkUrl(url)
    setBusy(false)
    if (!valid) {
      setError('Das sieht nicht nach einem gültigen Anmeldelink aus. Bitte die komplette Adresse aus der Adressleiste kopieren.')
      return
    }
    setLinkToComplete(url)
    setPasteInput('')
  }

  async function handleSignOut() {
    await signOutSync()
    stopSync()
    setUser(null)
  }

  async function handleResync() {
    setBusy(true)
    setError(null)
    try {
      await resyncNow()
      flash('Synchronisiert.')
    } catch {
      setError('Synchronisation fehlgeschlagen. Bitte später erneut versuchen.')
    } finally {
      setBusy(false)
    }
  }

  const openedInSafariNotApp = linkToComplete !== null && !isRunningStandalone()

  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <SettingsBackHeader title="Sync" />

      <section className="mb-6 rounded-3xl bg-surface p-4 shadow-sm shadow-black/5">
        <h2 className="mb-1 text-sm font-semibold text-ink">Firebase-Projekt</h2>
        <p className="mb-3 text-xs text-ink-soft">
          {isCustom
            ? 'Kostenlose geräteübergreifende Synchronisation über dein eigenes Firebase-Projekt (Google, Gratis-Kontingent).'
            : 'Kostenlose geräteübergreifende Synchronisation — läuft bereits über das in der App hinterlegte Firebase-Projekt, einfach unten anmelden.'}
        </p>

        {showOverrideForm ? (
          <>
            <p className="mb-2 text-xs text-ink-soft">
              Eigenes Firebase-Projekt verwenden statt des hinterlegten: Erstelle unter{' '}
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
            <textarea
              value={configText}
              onChange={(e) => setConfigText(e.target.value)}
              placeholder={'const firebaseConfig = {\n  apiKey: "…",\n  authDomain: "…",\n  projectId: "…",\n  …\n};'}
              rows={5}
              className="w-full resize-none rounded-xl border border-line bg-bg px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={handleSaveConfig}
                className="glass-accent flex-1 rounded-xl py-2.5 text-sm font-semibold"
              >
                Speichern
              </button>
              <button
                onClick={() => {
                  setShowOverrideForm(false)
                  setConfigText('')
                  setConfigError(null)
                }}
                className="shrink-0 rounded-xl bg-bg px-4 text-sm font-medium text-ink-soft hover:bg-line"
              >
                Abbrechen
              </button>
            </div>
            {configError && <p className="mt-3 text-xs text-red-500">{configError}</p>}
          </>
        ) : (
          <div className="flex items-center justify-between rounded-xl bg-bg px-3 py-2.5">
            <span className="text-sm text-ink">
              Projekt: <span className="font-medium">{config.projectId}</span>
            </span>
            <button
              type="button"
              onClick={() => (isCustom ? handleRemoveConfig() : setShowOverrideForm(true))}
              className={`text-xs font-medium ${isCustom ? 'text-red-500' : 'text-accent'}`}
            >
              {isCustom ? 'Entfernen' : 'Anderes Projekt'}
            </button>
          </div>
        )}
      </section>

      <section className="mb-6 rounded-3xl bg-surface p-4 shadow-sm shadow-black/5">
        <h2 className="mb-1 text-sm font-semibold text-ink">Anmeldung</h2>

        {linkToComplete ? (
          <>
            {openedInSafariNotApp && (
              <p className="mb-3 rounded-2xl bg-fat/15 px-3 py-2 text-xs text-ink">
                Dieser Link wurde in Safari geöffnet, nicht in deiner installierten App — iOS trennt
                deren Speicher, eine Anmeldung hier würde in der App nicht ankommen. Kopiere stattdessen
                die Adresse oben aus der Adressleiste, öffne die installierte App und füge sie dort unter
                "Link aus Safari einfügen" ein.
              </p>
            )}
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
              <span className={`text-xs ${getSyncStatus() === 'error' ? 'text-red-500' : 'text-ink-soft'}`}>
                {getSyncStatus() === 'syncing'
                  ? 'Synchronisation aktiv.'
                  : getSyncStatus() === 'error'
                    ? `Synchronisation fehlgeschlagen: ${getSyncError()}`
                    : 'Wird verbunden…'}
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
        ) : (
          <>
            {linkSent ? (
              <p className="mb-4 text-sm text-ink">
                Anmeldelink an <span className="font-medium">{email}</span> gesendet. E-Mail öffnen und
                den Link antippen, um die Anmeldung abzuschließen.
              </p>
            ) : (
              <>
                <p className="mb-3 text-xs text-ink-soft">
                  Anmeldung ohne Passwort per Link per E-Mail. Auf jedem Gerät, das synchronisieren soll,
                  mit derselben E-Mail-Adresse anmelden.
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
                  className="glass-accent mt-3 mb-4 w-full rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  Anmeldelink senden
                </button>
              </>
            )}

            <div className="border-t border-line pt-4">
              <p className="mb-2 text-xs text-ink-soft">
                Link stattdessen in Safari geöffnet (z. B. als installierte "Zum Home-Bildschirm"-App)?
                Adresse aus der Safari-Adressleiste kopieren und hier einfügen:
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={pasteInput}
                  onChange={(e) => setPasteInput(e.target.value)}
                  placeholder="https://maxjkb.github.io/…"
                  className="flex-1 rounded-xl border border-line bg-bg px-3 py-2 text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
                />
                <button
                  onClick={handlePasteLink}
                  disabled={busy || !pasteInput.trim()}
                  className="shrink-0 rounded-xl bg-bg px-4 text-sm font-medium text-ink-soft hover:bg-line disabled:opacity-50"
                >
                  Bestätigen
                </button>
              </div>
            </div>
          </>
        )}

        {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
      </section>

      {user && (
        <p className="mb-6 px-1 text-xs text-ink-soft">
          Synchronisiert werden Mahlzeiten, Rezepte, Körperwerte & Ziele sowie der Gemini-API-Key.
        </p>
      )}

      <SavedToast message={message} />
    </div>
  )
}
