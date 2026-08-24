import { useEffect, useState } from 'react'
import { SettingsBackHeader } from '../../components/SettingsBackHeader'
import { SavedToast } from '../../components/SavedToast'
import { useSavedToast } from '../../hooks/useSavedToast'
import { isStoragePersisted, requestPersistentStorage } from '../../lib/persistence'

export function StorageSettingsPage() {
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const { message, flash } = useSavedToast()

  useEffect(() => {
    isStoragePersisted().then(setPersisted)
  }, [])

  async function handleRequestPersistence() {
    const granted = await requestPersistentStorage()
    setPersisted(granted)
    flash(granted ? 'Dauerhafter Speicher aktiviert.' : 'Browser hat dauerhaften Speicher (noch) nicht gewährt.')
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <SettingsBackHeader title="Speicher" />

      <section className="mb-6 rounded-3xl bg-surface p-4 shadow-sm shadow-black/5">
        <h2 className="mb-1 text-sm font-semibold text-ink">Dauerhafter Speicher</h2>
        <p className="mb-3 text-xs text-ink-soft">
          Bittet den Browser, API-Key und Mahlzeiten nicht automatisch aufzuräumen (kostenlose
          Browser-Funktion, kein Backend). Auf iOS ist eine zum Homescreen hinzugefügte App ohnehin
          von Safaris automatischer 7-Tage-Bereinigung ausgenommen.
        </p>
        {persisted === true ? (
          <p className="rounded-xl bg-carbs/15 px-3 py-2 text-xs font-medium text-ink">
            ✓ Dauerhafter Speicher aktiv.
          </p>
        ) : (
          <div className="rounded-xl bg-fat/15 px-3 py-2 text-xs text-ink">
            <p className="mb-2">
              Dauerhafter Speicher noch nicht bestätigt
              {persisted === null && ' — dein Browser unterstützt diese Funktion evtl. nicht'}.
            </p>
            <button
              type="button"
              onClick={handleRequestPersistence}
              className="rounded-full bg-fat/30 px-3 py-1 font-semibold hover:bg-fat/40"
            >
              Jetzt aktivieren
            </button>
          </div>
        )}
      </section>

      <SavedToast message={message} />
    </div>
  )
}
