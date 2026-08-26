import { useCallback, useState } from 'react'
import { Sheet } from './Sheet'
import { useSheetClose } from '../hooks/useSheetClose'
import { DayShape } from './DayShape'
import type { MacroType } from './MacroIcon'
import { MACRO_LABELS } from '../lib/macros'
import { markDayShapeIntroSeen } from '../lib/dayShapeIntro'

/**
 * Values used only for the demonstration — deliberately not the user's own.
 *
 * A real day is often lopsided in a way that muddies the lesson (an empty
 * morning teaches "the shape is a stub"), and on a fresh install there is no
 * data at all. These four are close to target but visibly uneven, which is
 * exactly the reading the shape exists to make instant.
 */
const DEMO_VALUES = { kcal: 1680, protein: 96, carbs: 219, fat: 27 }
const DEMO_TARGETS = { kcal: 2100, protein: 120, carbs: 230, fat: 70 }

/*
 * Each line has to be true of the petal being drawn as it is drawn — an
 * explanation that describes something other than what's on screen teaches
 * the wrong thing twice over. So the demo values above are picked to make
 * these sentences literally correct: 80% (kcal), 80% (protein), 95% (carbs,
 * "nearly touching"), 39% (fat, "visibly short").
 */
const STEP_COPY: Record<MacroType, string> = {
  kcal: 'Jeder Bogen ist ein Nährwert. Dieser hier sind die Kalorien.',
  protein: 'Je weiter ein Bogen nach außen reicht, desto näher bist du am Tagesziel.',
  carbs: 'Der gepunktete Ring außen ist das Ziel. Dieser Bogen ist fast dran.',
  fat: 'Und ein kurzer Bogen heißt: hier fehlt noch etwas. Mehr musst du nicht lesen.',
}

/**
 * The one-time introduction to the day shape.
 *
 * HIG (Charting Data) requires this, it isn't decoration: "If you need to
 * create a chart that presents data in a novel way, help people learn how to
 * interpret the chart. For example, when pairing devices, an activity
 * tracker introduces the activity rings by animating them individually,
 * showing people how each ring maps to different metrics."
 *
 * So: the four petals grow one at a time, each with a line naming what it
 * is and what its length means, and the whole thing is skippable at any
 * point — the same graphic the user will see every day afterward, drawn
 * slowly once. It can be replayed from Einstellungen → Version & Neues,
 * because a one-time explanation you missed is worse than none.
 */
export function DayShapeIntro({ onClose }: { onClose: () => void }) {
  return (
    <Sheet
      onClose={onClose}
      sheetClassName="glass flex w-full max-w-lg flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl"
    >
      <IntroContent />
    </Sheet>
  )
}

function IntroContent() {
  const requestClose = useSheetClose()
  const [step, setStep] = useState<MacroType | null>(null)

  // Stable across renders: DayShape restarts its animation whenever this
  // identity changes, and an inline arrow would hand it a new one every time
  // the step below updates — i.e. on every step.
  const handleStep = useCallback((metric: MacroType | null) => setStep(metric), [])

  function finish() {
    markDayShapeIntroSeen()
    requestClose()
  }

  return (
    <div className="flex flex-col items-center px-6 pb-7 pt-7">
      <h2 className="type-title mb-1 text-center text-xl text-ink">Deine Tagesform</h2>
      <p className="mb-5 text-center text-sm text-ink-soft">
        Die Übersicht im Feed sieht ab jetzt so aus.
      </p>

      <DayShape values={DEMO_VALUES} targets={DEMO_TARGETS} size={190} teach onTeachStep={handleStep} />

      {/* Fixed height so the copy changing between steps doesn't make the
          sheet jump — the shape above must stay put while it's being
          explained, which is the whole point of the sequence. */}
      <p className="mt-5 flex min-h-[3.5rem] items-center text-center text-sm leading-relaxed text-ink">
        {step ? STEP_COPY[step] : 'Vier Bögen, einer je Nährwert.'}
      </p>

      {step && (
        <span className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
          {MACRO_LABELS[step]}
        </span>
      )}

      <button
        type="button"
        onClick={finish}
        className="glass-accent mt-4 w-full rounded-2xl px-4 py-3.5 text-sm font-semibold transition"
      >
        Verstanden
      </button>
    </div>
  )
}
