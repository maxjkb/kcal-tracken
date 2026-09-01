import { useEffect, useRef, useState } from 'react'
import { isSpeechRecognitionSupported, startDictation, type DictationSession } from '../lib/speech'

/**
 * `inline` sits inside the single-line text field at its right edge;
 * `floating` is the standalone round button that takes its place under the
 * send button once the field has wrapped to a second line. Same control,
 * same blue outline motif either way — only the frame around it changes, so
 * the icon never appears to swap identity as it moves.
 */
export type DictationButtonVariant = 'inline' | 'floating'

export function DictationButton({
  onRecordingDone,
  disabled,
  variant = 'floating',
  onListeningChange,
}: {
  onRecordingDone: (rawText: string) => void
  disabled?: boolean
  variant?: DictationButtonVariant
  /**
   * Reports the recording state up to a caller that wants to react to it
   * elsewhere on the page — the Mahlzeiten-Editor's field-filling waveform
   * (see MealEditor.tsx), which lives in a sibling element this button has
   * no reach into on its own.
   */
  onListeningChange?: (listening: boolean) => void
}) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const sessionRef = useRef<DictationSession | null>(null)
  const supported = isSpeechRecognitionSupported()

  useEffect(() => {
    return () => sessionRef.current?.stop()
  }, [])

  // Mirrors `listening` up to the caller on every change — a plain effect
  // rather than a `setListening` wrapper called at each of the three spots
  // that flip it below: `onListeningChange` is passed fresh on every render
  // (MealEditor hands it an inline setState function), so a wrapper closing
  // over it would need a ref just to stay current, for no benefit over
  // letting the effect read the latest prop itself.
  useEffect(() => {
    onListeningChange?.(listening)
  }, [listening, onListeningChange])

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

  const inline = variant === 'inline'
  const frame = inline
    ? // No frame at all: embedded in the field, a circle around it would read
      // as a second, competing field edge.
      'h-7 w-7'
    : // Outline rather than a filled circle — the send button beside it is the
      // one filled control, and two solid circles would compete for the eye.
      'h-11 w-11 border-[1.5px] border-accent'
  const resting = inline ? 'text-accent' : 'bg-transparent text-accent'

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
        className={`flex shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
          listening
            ? `${inline ? 'h-7 w-7' : 'h-11 w-11'} animate-pulse bg-danger text-white shadow-sm shadow-danger/30`
            : `${frame} ${resting}`
        }`}
      >
        {listening ? <CheckIcon className={inline ? 'h-4 w-4' : 'h-5 w-5'} /> : <MicIcon className={inline ? 'h-[1.05rem] w-[1.05rem]' : 'h-5 w-5'} />}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  )
}

function MicIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
      <path strokeLinecap="round" d="M19 11a7 7 0 0 1-14 0M12 18v3" />
    </svg>
  )
}

function CheckIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}
