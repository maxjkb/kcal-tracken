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
 * Starts continuous German speech recognition. `onTranscript` is called with
 * the full accumulated transcript (final + interim) each time it changes.
 */
export function startDictation(opts: {
  onTranscript: (text: string) => void
  onError?: (message: string) => void
  onEnd?: () => void
}): DictationSession | null {
  const Ctor = getSpeechRecognitionCtor()
  if (!Ctor) {
    opts.onError?.('Diktierfunktion wird von diesem Browser nicht unterstützt.')
    return null
  }

  const recognition = new Ctor()
  recognition.lang = 'de-DE'
  recognition.continuous = true
  recognition.interimResults = true

  let finalTranscript = ''

  recognition.onresult = (event) => {
    let interim = ''
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i]
      const transcript = result[0].transcript
      if (result.isFinal) {
        finalTranscript += transcript + ' '
      } else {
        interim += transcript
      }
    }
    opts.onTranscript((finalTranscript + interim).trim())
  }

  recognition.onerror = (event) => {
    if (event.error === 'no-speech' || event.error === 'aborted') return
    opts.onError?.(`Diktierfehler: ${event.error}`)
  }

  recognition.onend = () => {
    opts.onEnd?.()
  }

  recognition.start()

  return {
    stop: () => recognition.stop(),
  }
}
