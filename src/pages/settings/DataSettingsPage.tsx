import { useState } from 'react'
import { SettingsBackHeader } from '../../components/SettingsBackHeader'
import { SavedToast } from '../../components/SavedToast'
import { useSavedToast } from '../../hooks/useSavedToast'
import { db } from '../../lib/db'
import { getBodyProfile, setBodyProfile, type BodyProfile } from '../../lib/bodyProfile'
import { deleteMeal } from '../../hooks/useMeals'

/**
 * Everything a backup has to carry to actually restore this app.
 *
 * The first version wrote a bare array of meals, while the page's own copy
 * told the user to export "regelmäßig ein Backup, falls du den Browser
 * wechselst" — so anyone who followed that advice and restored it lost every
 * recipe, the whole supplement catalog and routine, the entire check-in
 * history and their body profile, with nothing warning them that the file had
 * never contained them.
 */
interface BackupFile {
  version: 2
  exportedAt: string
  meals: unknown[]
  recipes: unknown[]
  supplements: unknown[]
  mySupplements: unknown[]
  supplementLog: unknown[]
  bodyProfile: BodyProfile | null
}

export function DataSettingsPage() {
  const [confirmingReset, setConfirmingReset] = useState(false)
  const { message, flash } = useSavedToast()

  async function handleExport() {
    const [meals, recipes, supplements, mySupplements, supplementLog] = await Promise.all([
      db.meals.toArray(),
      db.recipes.toArray(),
      db.supplements.toArray(),
      db.mySupplements.toArray(),
      db.supplementLog.toArray(),
    ])
    const backup: BackupFile = {
      version: 2,
      exportedAt: new Date().toISOString(),
      meals,
      recipes,
      supplements,
      mySupplements,
      supplementLog,
      bodyProfile: getBodyProfile(),
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tracke-export-${new Date().toISOString().slice(0, 10)}.json`
    // Attached, clicked, then revoked on the next frame. Safari — this app's
    // primary target — does not reliably start a download from a detached
    // anchor whose object URL is revoked in the same tick.
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    requestAnimationFrame(() => {
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    })
  }

  async function handleImport(input: HTMLInputElement) {
    const file = input.files?.[0]
    // Reset unconditionally: the input keeps its value, so re-importing the
    // same file would otherwise fire no change event and do nothing.
    input.value = ''
    if (!file) return
    const text = await file.text()
    try {
      const parsed: unknown = JSON.parse(text)
      // A bare array is a version-1 export — meals only. Still restored, so an
      // older backup doesn't become unreadable.
      const backup: Partial<BackupFile> = Array.isArray(parsed) ? { meals: parsed } : (parsed as Partial<BackupFile>)
      if (!backup || typeof backup !== 'object' || !Array.isArray(backup.meals)) throw new Error('invalid')

      await Promise.all([
        db.meals.bulkPut(backup.meals as never[]),
        Array.isArray(backup.recipes) ? db.recipes.bulkPut(backup.recipes as never[]) : Promise.resolve(),
        Array.isArray(backup.supplements) ? db.supplements.bulkPut(backup.supplements as never[]) : Promise.resolve(),
        Array.isArray(backup.mySupplements) ? db.mySupplements.bulkPut(backup.mySupplements as never[]) : Promise.resolve(),
        Array.isArray(backup.supplementLog) ? db.supplementLog.bulkPut(backup.supplementLog as never[]) : Promise.resolve(),
      ])
      if (backup.bodyProfile) setBodyProfile(backup.bodyProfile)

      const counts = [
        `${backup.meals.length} Mahlzeiten`,
        Array.isArray(backup.recipes) && backup.recipes.length > 0 ? `${backup.recipes.length} Rezepte` : null,
        Array.isArray(backup.mySupplements) && backup.mySupplements.length > 0
          ? `${backup.mySupplements.length} Supplements`
          : null,
      ].filter(Boolean)
      flash(`${counts.join(', ')} importiert.`)
    } catch {
      flash('Import fehlgeschlagen: ungültige Datei.')
    }
  }

  async function handleResetAll() {
    // Deleted one by one through deleteMeal rather than with db.meals.clear():
    // clear() only empties the local table, so nothing told the server. The
    // next reconciliation saw remote documents with no local match and put
    // every "deleted" meal straight back — on this device and on every other
    // signed-in one. deleteMeal writes the tombstone that carries the deletion
    // across.
    const ids = await db.meals.toCollection().primaryKeys()
    for (const id of ids) await deleteMeal(id)
    setConfirmingReset(false)
    flash(`${ids.length} Mahlzeiten gelöscht.`)
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <SettingsBackHeader title="Daten" />

      <section className="mb-6 rounded-3xl bg-surface p-4 shadow-sm shadow-black/5">
        <h2 className="mb-1 text-sm font-semibold text-ink">Backup & Zurücksetzen</h2>
        <p className="mb-3 text-xs text-ink-soft">
          Deine Daten liegen nur in diesem Browser. Das Backup enthält Mahlzeiten, Rezepte,
          Supplements samt Einnahme-Verlauf und deine Körperwerte — exportiere regelmäßig eines,
          falls du den Browser wechselst oder Speicher leerst. Ein druckfertiges
          Ernährungstagebuch als PDF exportierst du auf der Statistik-Seite für den dort gewählten
          Zeitraum.
        </p>

        <div className="flex flex-col gap-2">
          <button
            onClick={handleExport}
            className="rounded-xl bg-bg py-2.5 text-sm font-medium text-ink hover:bg-line"
          >
            Backup exportieren (JSON)
          </button>
          <label className="cursor-pointer rounded-xl bg-bg py-2.5 text-center text-sm font-medium text-ink hover:bg-line">
            Backup importieren
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => void handleImport(e.target)}
            />
          </label>

          {confirmingReset ? (
            <div className="flex gap-2">
              <button
                onClick={handleResetAll}
                className="flex-1 rounded-xl bg-danger py-2.5 text-sm font-medium text-white hover:opacity-90"
              >
                Wirklich alles löschen
              </button>
              <button
                onClick={() => setConfirmingReset(false)}
                className="flex-1 rounded-xl bg-bg py-2.5 text-sm text-ink-soft hover:bg-line"
              >
                Abbrechen
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingReset(true)}
              className="rounded-xl py-2.5 text-sm font-medium text-danger hover:bg-danger/10"
            >
              Alle Mahlzeiten löschen
            </button>
          )}
        </div>
      </section>

      <SavedToast message={message} />
    </div>
  )
}
