import { useEffect, useRef, useState } from 'react'
import { isSpeechRecognitionSupported, startDictation, type DictationSession } from '../lib/speech'

export function DictationButton({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sessionRef = useRef<DictationSession | null>(null)
  const supported = isSpeechRecognitionSupported()

  useEffect(() => {
    return () => sessionRef.current?.stop()
  }, [])

  function toggle() {
    if (listening) {
      sessionRef.current?.stop()
      sessionRef.current = null
      setListening(false)
      return
    }
    setError(null)
    const session = startDictation({
      onTranscript,
      onError: (message) => {
        setError(message)
        setListening(false)
      },
      onEnd: () => setListening(false),
    })
    if (session) {
      sessionRef.current = session
      setListening(true)
    }
  }

  if (!supported) return null

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={listening}
        aria-label={listening ? 'Diktat stoppen' : 'Diktat starten'}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${
          listening
            ? 'bg-red-500 text-white shadow-lg shadow-red-500/30 animate-pulse'
            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
        }`}
      >
        <MicIcon />
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  )
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
      <path strokeLinecap="round" d="M19 11a7 7 0 0 1-14 0M12 18v3" />
    </svg>
  )
}
