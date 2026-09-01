/**
 * A small live-look waveform, shown in place of the text while dictation is
 * recording — "so aussieht, als ob die KI auf meine Stimme reagiert. Also
 * ein bisschen wie bei WhatsApp Audios oder beim Telefonieren."
 *
 * Not driven by the actual microphone level. The Web Speech API this app's
 * dictation runs on (lib/speech.ts) hands back recognized text, never a raw
 * audio signal — getting real amplitude would mean opening a second,
 * independent `getUserMedia` stream purely to read it, running alongside
 * the one `SpeechRecognition` already owns internally. That second stream
 * is exactly the kind of thing this environment has no microphone to
 * actually exercise end-to-end, and speech.ts's own history (see its
 * doc comments) is a record of how easily a "just one more audio API call"
 * change here regresses recording that was hard-won to get reliable. A
 * lively but synthetic pulse costs none of that risk and reads the same
 * to the eye — which is what was actually asked for ("sieht so aus, als
 * ob…"), not literal amplitude accuracy.
 *
 * Same idiom as BouncingDots (index.css's dot-bounce): one shared keyframe,
 * each bar desynchronized from the others by its own duration/delay rather
 * than a distinct keyframe per bar — which is also `.glass`'s own liquid-
 * drift reasoning for why two unsynchronized highlights read as alive where
 * one ever-so-slightly-off copy of itself would read as broken.
 */
export function DictationWaveform() {
  return (
    <span className="flex h-5 items-center gap-[3px]" aria-hidden="true">
      {WAVEFORM_BARS.map((bar, i) => (
        <span
          key={i}
          className="waveform-bar"
          style={{ animationDuration: `${bar.duration}ms`, animationDelay: `${bar.delay}ms` }}
        />
      ))}
    </span>
  )
}

/** Durations/delays picked by hand, not generated, so no two bars ever land in step — a regular stride (0/100/200…) still reads as one mechanical sweep across the row. */
const WAVEFORM_BARS = [
  { duration: 720, delay: 0 },
  { duration: 900, delay: 260 },
  { duration: 640, delay: 80 },
  { duration: 980, delay: 420 },
  { duration: 760, delay: 140 },
]
