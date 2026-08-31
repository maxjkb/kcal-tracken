import { useEffect, useRef, useState } from 'react'
import { isSpeechRecognitionSupported, startDictation, type DictationSession } from '../lib/speech'

export function DictationButton({
  onRecordingDone,
  disabled,
}: {
  onRecordingDone: (rawText: string) => void
  disabled?: boolean
}) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const sessionRef = useRef<DictationSession | null>(null)
  const supported = isSpeechRecognitionSupported()

  useEffect(() => {
    return () => sessionRef.current?.stop()
  }, [])

  function toggle() {
    if (listening) {
      sessionRef.current?.stop()
      return
    }
    setError(null)
    setInterim('')
    const session = startDictation({
      onDone: (text) => {
        setListening(false)
        setInterim('')
        sessionRef.current = null
        if (text) onRecordingDone(text)
      },
      onError: (message) => {
        setError(message)
        setListening(false)
        setInterim('')
        sessionRef.current = null
      },
      onInterim: setInterim,
    })
    if (session) {
      sessionRef.current = session
      setListening(true)
    }
  }

  if (!supported) return null

  return (
    <div className="relative flex flex-col items-end gap-1">
      {/* Live preview of what's being heard right now, before anything is
          finalized — the actual fix for "fühlt sich langsam an" wasn't
          making recognition itself faster (it can't be, it's the browser's
          own engine), it was giving the ~1-2s of silence before the first
          words land somewhere to look at. Positioned above the button so it
          never collides with the text field the transcript eventually lands
          in. */}
      {listening && interim && (
        <span className="absolute bottom-full right-0 mb-2 max-w-[16rem] rounded-2xl bg-ink px-3 py-2 text-xs text-white shadow-lg">
          {interim}
        </span>
      )}
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-pressed={listening}
        aria-label={listening ? 'Diktat stoppen' : 'Diktat starten'}
        // 44px, matching ActionButton: the two now sit stacked beside the
        // text field, where a 4px size difference reads as a mistake — and 40
        // was under the 44pt minimum target size anyway.
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
          listening ? 'animate-pulse bg-danger text-white shadow-sm shadow-danger/30' : 'bg-bg text-ink-soft hover:bg-line'
        }`}
      >
        {listening ? <CheckIcon /> : <MicIcon />}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
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

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}
