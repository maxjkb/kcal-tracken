import { useEffect, useState } from 'react'
import { clearApiKey, getApiKey, setApiKey } from '../lib/settings'
import { getModel, setModel } from '../lib/gemini'
import { db } from '../lib/db'
import { isStoragePersisted, requestPersistentStorage } from '../lib/persistence'
import { BodyProfileSection } from '../components/BodyProfileSection'

const MODEL_SUGGESTIONS = [
  { value: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash (empfohlen – gutes Gratis-Kontingent)' },
  { value: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (schneller, höheres Kontingent)' },
]

export function SettingsPage() {
  const [apiKey, setApiKeyInput] = useState(getApiKey() ?? '')
  const [showKey, setShowKey] = useState(false)
  const [model, setModelInput] = useState(getModel())
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [persisted, setPersisted] = useState<boolean | null>(null)

  useEffect(() => {
    isStoragePersisted().then(setPersisted)
  }, [])

  function flashSaved(message: string) {
    setSavedMsg(message)
    setTimeout(() => setSavedMsg(null), 2500)
  }

  async function handleRequestPersistence() {
    const granted = await requestPersistentStorage()
    setPersisted(granted)
    flashSaved(granted ? 'Dauerhafter Speicher aktiviert.' : 'Browser hat dauerhaften Speicher (noch) nicht gewährt.')
  }

  function handleSaveKey() {
    if (apiKey.trim()) {
      setApiKey(apiKey)
      flashSaved('API-Key gespeichert.')
    } else {
      clearApiKey()
      flashSaved('API-Key entfernt.')
    }
  }

  function handleModelChange(value: string) {
    setModelInput(value)
    setModel(value)
  }

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
      flashSaved(`${meals.length} Mahlzeiten importiert.`)
    } catch {
      flashSaved('Import fehlgeschlagen: ungültige Datei.')
    }
  }

  async function handleResetAll() {
    await db.meals.clear()
    setConfirmingReset(false)
    flashSaved('Alle Mahlzeiten gelöscht.')
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-40 pt-6">
      <h1 className="mb-4 text-2xl font-bold tracking-tight text-ink">Einstellungen</h1>

      <section className="mb-6 rounded-3xl bg-surface p-4 shadow-sm shadow-black/5">
        <h2 className="mb-1 text-sm font-semibold text-ink">Google Gemini API-Key</h2>
        <p className="mb-3 text-xs text-ink-soft">
          Kostenlos im Rahmen des Gratis-Kontingents von Google. Wird nur lokal in deinem Browser
          gespeichert – nie an einen Server außer die Gemini-API gesendet. Einen Key bekommst du
          unter{' '}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-accent underline"
          >
            aistudio.google.com/apikey
          </a>{' '}
          (Google-Konto nötig, kein Zahlungsmittel erforderlich). Das Gratis-Kontingent ist
          rate-limitiert – bei "Rate-Limit erreicht" einfach kurz warten.
        </p>
        <div className="flex gap-2">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="AIza…"
            className="flex-1 rounded-xl border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="rounded-xl bg-bg px-3 text-xs font-medium text-ink-soft hover:bg-line"
          >
            {showKey ? 'Verbergen' : 'Anzeigen'}
          </button>
        </div>
        <button
          onClick={handleSaveKey}
          className="glass-accent mt-3 w-full rounded-xl py-2.5 text-sm font-semibold"
        >
          Speichern
        </button>
      </section>

      <section className="mb-6 rounded-3xl bg-surface p-4 shadow-sm shadow-black/5">
        <h2 className="mb-1 text-sm font-semibold text-ink">Modell für Nährwertschätzung</h2>
        <p className="mb-3 text-xs text-ink-soft">
          Google benennt Gemini-Modelle gelegentlich um oder schaltet alte Versionen ab. Falls die
          Schätzung mit "Modell nicht gefunden" fehlschlägt, hier den aktuellen Modellnamen von{' '}
          <a
            href="https://ai.google.dev/gemini-api/docs/models"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-accent underline"
          >
            ai.google.dev/gemini-api/docs/models
          </a>{' '}
          eintragen.
        </p>
        <input
          list="model-suggestions"
          type="text"
          value={model}
          onChange={(e) => handleModelChange(e.target.value)}
          className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
        />
        <datalist id="model-suggestions">
          {MODEL_SUGGESTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </datalist>
      </section>

      <BodyProfileSection onSaved={() => flashSaved('Körperwerte gespeichert.')} />

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

      <section className="mb-6 rounded-3xl bg-surface p-4 shadow-sm shadow-black/5">
        <h2 className="mb-1 text-sm font-semibold text-ink">Daten</h2>
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

      {savedMsg && (
        <p className="glass fixed bottom-24 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 text-xs font-medium text-ink">
          {savedMsg}
        </p>
      )}
    </div>
  )
}
