import { useState } from 'react'
import { SettingsBackHeader } from '../../components/SettingsBackHeader'
import { SavedToast } from '../../components/SavedToast'
import { useSavedToast } from '../../hooks/useSavedToast'
import { clearApiKey, getApiKey, setApiKey } from '../../lib/settings'
import { getModel, setModel } from '../../lib/gemini'

const MODEL_SUGGESTIONS = [
  { value: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash (empfohlen – gutes Gratis-Kontingent)' },
  { value: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (schneller, höheres Kontingent)' },
]

export function ApiSettingsPage() {
  const [apiKey, setApiKeyInput] = useState(getApiKey() ?? '')
  const [showKey, setShowKey] = useState(false)
  const [model, setModelInput] = useState(getModel())
  const { message, flash } = useSavedToast()

  function handleSaveKey() {
    if (apiKey.trim()) {
      setApiKey(apiKey)
      flash('API-Key gespeichert.')
    } else {
      clearApiKey()
      flash('API-Key entfernt.')
    }
  }

  function handleModelChange(value: string) {
    setModelInput(value)
    setModel(value)
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <SettingsBackHeader title="Gemini API" />

      <section className="mb-6 rounded-3xl bg-surface p-4 shadow-sm shadow-black/5">
        <h2 className="mb-1 text-sm font-semibold text-ink">API-Key</h2>
        <p className="mb-3 text-xs text-ink-soft">
          Kostenlos im Rahmen des Gratis-Kontingents von Google. Wird lokal in deinem Browser
          gespeichert (und, falls unter Sync eingerichtet, mit deinen anderen Geräten synchronisiert)
          – nie an einen Server außer die Gemini-API gesendet. Einen Key bekommst du unter{' '}
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
          className="glass-accent mt-3 w-full rounded-xl py-3 text-sm font-semibold"
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

      <SavedToast message={message} />
    </div>
  )
}
