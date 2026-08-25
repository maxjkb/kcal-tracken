// Minimal typings for the (non-standard, browser-only) Web Speech API.
// Not all browsers support this — callers must check isSpeechRecognitionSupported().

interface SpeechRecognitionResultEvent extends Event {
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

/**
 * Starts speech recognition and calls `onDone` exactly once, with the final
 * transcript, when recording stops (either via `.stop()` or the browser
 * ending recognition on its own). Deliberately does NOT use interim results
 * or stream partial text back during recording — some browsers (notably iOS
 * Safari) repeat/duplicate interim results, which previously caused the
 * dictated text to appear several times over in the field.
 */
export function startDictation(opts: {
  onDone: (text: string) => void
  onError?: (message: string) => void
}): DictationSession | null {
  const Ctor = getSpeechRecognitionCtor()
  if (!Ctor) {
    opts.onError?.('Diktierfunktion wird von diesem Browser nicht unterstützt.')
    return null
  }

  const recognition = new Ctor()
  recognition.lang = 'de-DE'
  recognition.continuous = true
  recognition.interimResults = false

  const finalSegments: string[] = []
  let done = false

  recognition.onresult = (event) => {
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i]
      if (result.isFinal) {
        const transcript = result[0].transcript.trim()
        if (transcript) finalSegments.push(transcript)
      }
    }
  }

  recognition.onerror = (event) => {
    if (event.error === 'no-speech' || event.error === 'aborted') return
    opts.onError?.(describeSpeechError(event.error))
  }

  recognition.onend = () => {
    if (done) return
    done = true
    opts.onDone(finalSegments.join(' ').trim())
  }

  recognition.start()

  return {
    stop: () => recognition.stop(),
  }
}
