import { useState } from 'react'
import { clearApiKey, getApiKey, setApiKey } from '../lib/settings'
import { getModel, setModel } from '../lib/anthropic'
import { db } from '../lib/db'

const MODEL_OPTIONS = [
  { value: 'claude-sonnet-5', label: 'Claude Sonnet 5 (empfohlen – gute Balance)' },
  { value: 'claude-opus-5', label: 'Claude Opus 5 (genauer, teurer)' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (schneller, günstiger)' },
]

export function SettingsPage() {
  const [apiKey, setApiKeyInput] = useState(getApiKey() ?? '')
  const [showKey, setShowKey] = useState(false)
  const [model, setModelInput] = useState(getModel())
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [confirmingReset, setConfirmingReset] = useState(false)

  function handleSaveKey() {
    if (apiKey.trim()) {
      setApiKey(apiKey)
      setSavedMsg('API-Key gespeichert.')
    } else {
      clearApiKey()
      setSavedMsg('API-Key entfernt.')
    }
    setTimeout(() => setSavedMsg(null), 2500)
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
      setSavedMsg(`${meals.length} Mahlzeiten importiert.`)
    } catch {
      setSavedMsg('Import fehlgeschlagen: ungültige Datei.')
    }
    setTimeout(() => setSavedMsg(null), 3000)
  }

  async function handleResetAll() {
    await db.meals.clear()
    setConfirmingReset(false)
    setSavedMsg('Alle Mahlzeiten gelöscht.')
    setTimeout(() => setSavedMsg(null), 2500)
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-6">
      <h1 className="mb-4 text-lg font-semibold text-slate-100">Einstellungen</h1>

      <section className="mb-6 rounded-2xl bg-slate-900 p-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-200">Anthropic API-Key</h2>
        <p className="mb-3 text-xs text-slate-500">
          Wird nur lokal in deinem Browser gespeichert – nie an einen Server außer die Claude-API
          gesendet. Einen Key bekommst du unter{' '}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noreferrer"
            className="text-emerald-400 underline"
          >
            console.anthropic.com
          </a>{' '}
          (Account nötig, Nutzung wird nach Verbrauch abgerechnet).
        </p>
        <div className="flex gap-2">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="sk-ant-…"
            className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="rounded-lg bg-slate-800 px-3 text-xs text-slate-300 hover:bg-slate-700"
          >
            {showKey ? 'Verbergen' : 'Anzeigen'}
          </button>
        </div>
        <button
          onClick={handleSaveKey}
          className="mt-3 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Speichern
        </button>
      </section>

      <section className="mb-6 rounded-2xl bg-slate-900 p-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-200">Modell für Nährwertschätzung</h2>
        <p className="mb-3 text-xs text-slate-500">Größere Modelle sind meist genauer, aber teurer pro Anfrage.</p>
        <select
          value={model}
          onChange={(e) => handleModelChange(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
        >
          {MODEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </section>

      <section className="mb-6 rounded-2xl bg-slate-900 p-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-200">Daten</h2>
        <p className="mb-3 text-xs text-slate-500">
          Alle Mahlzeiten liegen nur in diesem Browser. Exportiere regelmäßig ein Backup, falls du den
          Browser wechselst oder Speicher leerst.
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={handleExport}
            className="rounded-lg bg-slate-800 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-700"
          >
            Backup exportieren (JSON)
          </button>
          <label className="cursor-pointer rounded-lg bg-slate-800 py-2.5 text-center text-sm font-medium text-slate-200 hover:bg-slate-700">
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
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white hover:bg-red-500"
              >
                Wirklich alles löschen
              </button>
              <button
                onClick={() => setConfirmingReset(false)}
                className="flex-1 rounded-lg bg-slate-800 py-2.5 text-sm text-slate-300 hover:bg-slate-700"
              >
                Abbrechen
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingReset(true)}
              className="rounded-lg py-2.5 text-sm font-medium text-red-400 hover:bg-red-950/40"
            >
              Alle Mahlzeiten löschen
            </button>
          )}
        </div>
      </section>

      {savedMsg && (
        <p className="fixed bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-slate-800 px-4 py-2 text-xs text-slate-200 shadow-lg">
          {savedMsg}
        </p>
      )}
    </div>
  )
}
