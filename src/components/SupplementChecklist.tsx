import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  SUPPLEMENT_TIME_LABELS,
  toLocalDateKey,
  type MySupplement,
  type Supplement,
  type SupplementLogEntry,
  type SupplementTimeOfDay,
} from '../lib/db'
import { toggleSupplementCheck } from '../hooks/useSupplements'
import { computeSlotState } from '../lib/supplementTiming'
import { useNow } from '../hooks/useNow'
import { REDUCED_MOTION_TRANSITION, SPRING_DEFAULT, SPRING_SNAPPY } from '../lib/motionTokens'

/**
 * One supplement's row of time-of-day slots for a given day. Only the
 * slot(s) actually configured for this supplement render at all — a
 * once-daily supplement shows exactly one, not four mostly-irrelevant ones.
 * Whichever slot's window is live right now renders large and inviting;
 * the rest collapse to a small dot/check/✕ trail, so the one thing you'd
 * actually act on right now is what draws the eye.
 */
export function SupplementChecklistRow({
  mySupplement,
  supplement,
  date,
  logEntries,
  onEdit,
}: {
  mySupplement: MySupplement
  supplement: Supplement | undefined
  date: string
  logEntries: SupplementLogEntry[]
  /** Opens the edit sheet — lives only on the name/dosage text, never wrapping the slot buttons (a <button> can't legally nest another <button>, and doing so anyway made the browser's click handling between the two unpredictable). */
  onEdit: () => void
}) {
  const now = useNow()
  const todayKey = toLocalDateKey(new Date())
  const checkedTimes = new Set(
    logEntries.filter((e) => e.mySupplementId === mySupplement.id && e.date === date).map((e) => e.timeOfDay),
  )

  return (
    <div className="glass-subtle flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-medium text-ink">{supplement?.name ?? 'Supplement'}</p>
        {mySupplement.dosage && <p className="truncate text-xs text-ink-soft">{mySupplement.dosage}</p>}
      </button>
      <div className="flex shrink-0 items-center gap-2">
        {mySupplement.timesOfDay.map((timeOfDay) => (
          <SlotButton
            key={timeOfDay}
            mySupplementId={mySupplement.id}
            date={date}
            timeOfDay={timeOfDay}
            checked={checkedTimes.has(timeOfDay)}
            todayKey={todayKey}
            now={now}
          />
        ))}
      </div>
    </div>
  )
}

function SlotButton({
  mySupplementId,
  date,
  timeOfDay,
  checked,
  todayKey,
  now,
}: {
  mySupplementId: string
  date: string
  timeOfDay: SupplementTimeOfDay
  checked: boolean
  todayKey: string
  now: Date
}) {
  const state = computeSlotState({ date, timeOfDay, checked, todayKey, now })
  const isCurrent = state === 'current'
  const prefersReducedMotion = useReducedMotion()
  const layoutTransition = prefersReducedMotion ? REDUCED_MOTION_TRANSITION : SPRING_DEFAULT
  const glyphTransition = prefersReducedMotion ? REDUCED_MOTION_TRANSITION : SPRING_SNAPPY

  return (
    <motion.button
      type="button"
      layout
      transition={layoutTransition}
      onClick={() => toggleSupplementCheck(mySupplementId, date, timeOfDay)}
      aria-label={`${SUPPLEMENT_TIME_LABELS[timeOfDay]}${checked ? ' — genommen, antippen zum Rückgängigmachen' : ' — als genommen markieren'}`}
      className={
        isCurrent
          ? `flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors ${
              checked ? 'glass-accent' : 'bg-accent/12 text-accent'
            }`
          : 'flex h-8 w-8 items-center justify-center rounded-full'
      }
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={isCurrent ? `current-${state}` : state}
          layout
          initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.6 }}
          transition={glyphTransition}
          className="flex items-center gap-1.5"
        >
          {isCurrent ? (
            <>
              {checked ? <CheckGlyph className="h-3.5 w-3.5" /> : <RingGlyph className="h-3.5 w-3.5" />}
              {SUPPLEMENT_TIME_LABELS[timeOfDay]}
            </>
          ) : state === 'checked' ? (
            <CheckGlyph className="h-3 w-3 text-accent" />
          ) : state === 'missed' ? (
            <XGlyph className="h-2.5 w-2.5 text-ink-faint" />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-ink-faint" />
          )}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  )
}

function CheckGlyph({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function RingGlyph({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className={className}>
      <circle cx="12" cy="12" r="9" />
    </svg>
  )
}

function XGlyph({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className={className}>
      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
