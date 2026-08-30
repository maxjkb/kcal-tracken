// Minimal typings for the (non-standard, browser-only) Web Speech API.
// Not all browsers support this — callers must check isSpeechRecognitionSupported().

interface SpeechRecognitionResultEvent extends Event {
  /** Index of the first result new to this event — everything before it was already delivered. */
  resultIndex: number
  results: {
    length: number
    item(index: number): { 0: { transcript: string }; isFinal: boolean }
    [index: number]: { 0: { transcript: string }; isFinal: boolean }
  }
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null
}

export interface DictationSession {
  stop(): void
}

/**
 * The Web Speech API's `SpeechRecognitionErrorEvent.error` is a bare code
 * ("not-allowed", "audio-capture", ...) — translates the handful anyone
 * actually hits in practice into something a non-technical user can act
 * on, instead of showing the raw code as-is.
 */
const SPEECH_ERROR_HINTS: Record<string, string> = {
  'not-allowed': 'Kein Mikrofonzugriff erlaubt. In den iOS-Einstellungen unter Safari/dieser App den Mikrofon-Zugriff erlauben.',
  'service-not-allowed': 'Kein Mikrofonzugriff erlaubt. In den iOS-Einstellungen unter Safari/dieser App den Mikrofon-Zugriff erlauben.',
  'audio-capture': 'Kein Mikrofon gefunden. Ist eines angeschlossen/aktiv?',
  network: 'Netzwerkfehler bei der Spracherkennung. Internetverbindung prüfen.',
  'language-not-supported': 'Deutsch wird von der Spracherkennung dieses Geräts nicht unterstützt.',
}

function describeSpeechError(code: string): string {
  return SPEECH_ERROR_HINTS[code] ?? `Diktierfehler: ${code}`
}

/** After this long without the user explicitly stopping, the session ends on its own — a safety net against a forgotten open mic, not a normal stopping point. */
const MAX_SESSION_MS = 120_000
/**
 * `.stop()`/`.start()` calls that land while the engine is mid-transition
 * throw synchronously on some browsers ("already started" / no matching
 * session). A silent auto-restart is exactly the situation that triggers
 * this — this many attempts, a short delay apart, before giving up and
 * surfacing an error instead of leaving the button stuck in "listening".
 */
const MAX_RESTART_ATTEMPTS = 3

/**
 * Starts speech recognition and calls `onDone` exactly once, with the final
 * transcript, when the user explicitly stops (or the session's own safety
 * timeout elapses).
 *
 * The core bug this fixes: on `continuous: true`, the underlying engine
 * still ends the session on its own after a few seconds of silence — a
 * completely normal pause while someone thinks about what to say next, not
 * an indication they're done. The previous version treated ANY `onend` as
 * "the user is finished" and immediately returned whatever had been
 * collected so far, which is exactly what "nur Fragmente werden
 * übernommen" was: a sentence half-said before a thinking-pause got cut off
 * and silently finalized, and the rest of what the user said next, after
 * re-tapping the mic, started a brand-new (and brand-new, separately
 * Gemini-cleaned-up) transcript. Every one of those restarts also meant a
 * fresh round trip to Gemini's cleanup call — which is what actually made
 * the whole thing *feel* slow, on top of being wrong.
 *
 * The fix: distinguish an engine-initiated `onend` (silence, or any other
 * reason the browser decided to stop on its own) from a user-initiated one
 * (`.stop()` was called) via an explicit flag, and silently restart the
 * engine on the former — the accumulated transcript carries over, so a
 * mid-sentence pause is invisible to the caller. `interimResults` is back on
 * (see the `onInterim` callback below) now that the accumulation bug this
 * was disabled for is fixed by reading from `event.resultIndex` rather than
 * index 0 — that was the actual duplication cause, not interim results
 * themselves.
 */
export function startDictation(opts: {
  onDone: (text: string) => void
  onError?: (message: string) => void
  /** Live, non-final preview of what's being heard right now — lets the UI show progress instead of a silent spinner until the user stops. Replaces on every call; not accumulated. */
  onInterim?: (text: string) => void
}): DictationSession | null {
  const Ctor = getSpeechRecognitionCtor()
  if (!Ctor) {
    opts.onError?.('Diktierfunktion wird von diesem Browser nicht unterstützt.')
    return null
  }

  const finalSegments: string[] = []
  let stoppedByUser = false
  let restartAttempts = 0
  let recognition: SpeechRecognitionLike | null = null
  let maxDurationTimer: ReturnType<typeof setTimeout> | null = null

  function finish() {
    if (maxDurationTimer) clearTimeout(maxDurationTimer)
    opts.onDone(finalSegments.join(' ').trim())
  }

  function attach(r: SpeechRecognitionLike) {
    r.lang = 'de-DE'
    r.continuous = true
    r.interimResults = true

    r.onresult = (event) => {
      let interim = ''
      // From resultIndex, not from 0: with `continuous` on, `event.results` is
      // cumulative across events, so restarting at 0 re-appended every segment
      // that had already been collected. Three dictated phrases came out as
      // "A A B A B C" — fixed by only ever reading the results this specific
      // event actually added.
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const transcript = result[0].transcript.trim()
        if (result.isFinal) {
          if (transcript) finalSegments.push(transcript)
        } else {
          interim = transcript
        }
      }
      if (interim) opts.onInterim?.(interim)
    }

    r.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      stoppedByUser = true // don't attempt to restart into a real error
      opts.onError?.(describeSpeechError(event.error))
    }

    r.onend = () => {
      if (stoppedByUser) {
        finish()
        return
      }
      // The engine ended on its own — almost always a silence timeout mid-
      // pause, not the user being done. Restart transparently and keep
      // accumulating into the same finalSegments array.
      if (restartAttempts >= MAX_RESTART_ATTEMPTS) {
        finish()
        return
      }
      restartAttempts++
      try {
        r.start()
      } catch {
        // A start() while the engine hasn't fully torn down yet throws
        // synchronously on some browsers — one short retry covers it without
        // leaving the button stuck in "listening" forever.
        setTimeout(() => {
          if (stoppedByUser) return
          try {
            r.start()
          } catch {
            finish()
          }
        }, 150)
      }
    }
  }

  recognition = new Ctor()
  attach(recognition)
  recognition.start()

  maxDurationTimer = setTimeout(() => {
    stoppedByUser = true
    recognition?.stop()
  }, MAX_SESSION_MS)

  return {
    stop: () => {
      stoppedByUser = true
      recognition?.stop()
    },
  }
}
