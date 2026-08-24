import { useState } from 'react'
import { SettingsBackHeader } from '../../components/SettingsBackHeader'
import { SavedToast } from '../../components/SavedToast'
import { useSavedToast } from '../../hooks/useSavedToast'
import { db } from '../../lib/db'

export function DataSettingsPage() {
  const [confirmingReset, setConfirmingReset] = useState(false)
  const { message, flash } = useSavedToast()

  async function handleExport() {
    const meals = await db.meals.toArray()
    const blob = new Blob([JSON.stringify(meals, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kcal-tracker-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport(file: File | undefined) {
    if (!file) return
    const text = await file.text()
    try {
      const meals = JSON.parse(text)
      if (!Array.isArray(meals)) throw new Error('invalid')
      await db.meals.bulkPut(meals)
      flash(`${meals.length} Mahlzeiten importiert.`)
    } catch {
      flash('Import fehlgeschlagen: ungültige Datei.')
    }
  }

  async function handleResetAll() {
    await db.meals.clear()
    setConfirmingReset(false)
    flash('Alle Mahlzeiten gelöscht.')
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <SettingsBackHeader title="Daten" />

      <section className="mb-6 rounded-3xl bg-surface p-4 shadow-sm shadow-black/5">
        <h2 className="mb-1 text-sm font-semibold text-ink">Backup & Zurücksetzen</h2>
        <p className="mb-3 text-xs text-ink-soft">
          Alle Mahlzeiten und dein API-Key liegen nur in diesem Browser. Exportiere regelmäßig ein
          Backup, falls du den Browser wechselst oder Speicher leerst. Ein druckfertiges
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
              onChange={(e) => handleImport(e.target.files?.[0])}
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
