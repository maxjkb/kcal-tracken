import { useState } from 'react'
import { useMealsInRange } from '../hooks/useMeals'
import { toLocalDateKey } from '../lib/db'
import { FULL_MONTH_LABELS, MONTH_LABELS, startOfWeek } from '../lib/stats'
import { ChevronIcon } from './ChevronIcon'
import { Sheet } from './Sheet'
import { useSwipeBack } from '../hooks/useSwipeBack'

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

/** Shared modal chrome for all three pickers below — matches the existing Mahlzeiten-Detail/Editor sheet (bottom sheet on mobile, centered card from sm: up). */
function PickerShell({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <Sheet onClose={onClose} sheetClassName="glass flex w-full max-w-sm flex-col rounded-t-3xl p-5 pt-7 sm:rounded-3xl">
      <PickerShellContent title={title}>{children}</PickerShellContent>
    </Sheet>
  )
}

function PickerShellContent({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
      </div>
      {children}
    </>
  )
}

/** Header row shared by all three pickers: a circular prev/next arrow pair around a centered label. */
function NavRow({ label, onPrev, onNext }: { label: string; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <button
        onClick={onPrev}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-bg text-ink-soft hover:bg-line"
        aria-label="Zurück"
      >
        <ChevronIcon direction="left" className="h-3.5 w-3.5" />
      </button>
      <span className="text-sm font-medium text-ink">{label}</span>
      <button
        onClick={onNext}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-bg text-ink-soft hover:bg-line"
        aria-label="Weiter"
      >
        <ChevronIcon direction="right" className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function buildCalendarGrid(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month - 1, 1)
  const start = startOfWeek(firstOfMonth)
  const days: Date[] = []
  const cur = new Date(start)
  for (let i = 0; i < 42; i++) {
    days.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

/**
 * Day picker — a standard month calendar. Used by the Feed's date heading,
 * and by the Stats page for both the "Tag" tab (picks the shown day) and
 * the "Woche" tab (picks a day, which then implicitly selects the week
 * that contains it — the caller just sets the anchor).
 */
export function DayPickerModal({
  selectedDateKey,
  onSelect,
  onClose,
}: {
  selectedDateKey: string
  onSelect: (dateKey: string) => void
  onClose: () => void
}) {
  const [sy, sm] = selectedDateKey.split('-').map(Number)
  const [viewYear, setViewYear] = useState(sy)
  const [viewMonth, setViewMonth] = useState(sm) // 1-12

  const todayKey = toLocalDateKey(new Date())
  const monthStartKey = `${viewYear}-${String(viewMonth).padStart(2, '0')}-01`
  const monthEndKey = toLocalDateKey(new Date(viewYear, viewMonth, 0))
  // Fetched only for the visible month, to mark which days already have a
  // logged meal (a small dot) — cheap, and re-runs live as meals change.
  const monthMeals = useMealsInRange(monthStartKey, monthEndKey)
  const daysWithMeals = new Set((monthMeals ?? []).map((m) => m.date))

  function shiftMonth(delta: number) {
    const d = new Date(viewYear, viewMonth - 1 + delta, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth() + 1)
  }

  const grid = buildCalendarGrid(viewYear, viewMonth)
  // The arrow pair above has an obvious gesture equivalent: swipe right for the
  // previous month, left for the next.
  const swipeMonth = useSwipeBack(
    () => shiftMonth(-1),
    () => shiftMonth(1),
  )

  return (
    <PickerShell title="Datum wählen" onClose={onClose}>
      <div {...swipeMonth}>
      <NavRow
        label={`${FULL_MONTH_LABELS[viewMonth - 1]} ${viewYear}`}
        onPrev={() => shiftMonth(-1)}
        onNext={() => shiftMonth(1)}
      />
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-ink-faint">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {grid.map((date) => {
          const key = toLocalDateKey(date)
          const inMonth = date.getMonth() + 1 === viewMonth
          const isSelected = key === selectedDateKey
          const isToday = key === todayKey
          const hasMeal = daysWithMeals.has(key)
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className={`relative flex h-9 flex-col items-center justify-center rounded-full text-sm transition ${
                isSelected
                  ? 'bg-accent font-semibold text-white'
                  : inMonth
                    ? 'text-ink hover:bg-bg'
                    : 'text-ink-faint hover:bg-bg'
              } ${isToday && !isSelected ? 'ring-1 ring-inset ring-accent' : ''}`}
            >
              {date.getDate()}
              {hasMeal && (
                <span
                  className={`absolute bottom-1 h-1 w-1 rounded-full ${isSelected ? 'bg-white' : 'bg-accent'}`}
                />
              )}
            </button>
          )
        })}
      </div>
      </div>
    </PickerShell>
  )
}

/** Month picker — a 3×4 grid of months, with year navigation above it. Used by the Stats page's "Monat" tab. */
export function MonthPickerModal({
  selectedYear,
  selectedMonth,
  onSelect,
  onClose,
}: {
  selectedYear: number
  selectedMonth: number
  onSelect: (year: number, month: number) => void
  onClose: () => void
}) {
  const [viewYear, setViewYear] = useState(selectedYear)

  return (
    <PickerShell title="Monat wählen" onClose={onClose}>
      <NavRow label={String(viewYear)} onPrev={() => setViewYear((y) => y - 1)} onNext={() => setViewYear((y) => y + 1)} />
      <div className="grid grid-cols-3 gap-2">
        {MONTH_LABELS.map((label, i) => {
          const month = i + 1
          const isSelected = viewYear === selectedYear && month === selectedMonth
          return (
            <button
              key={label}
              onClick={() => onSelect(viewYear, month)}
              className={`rounded-xl py-3 text-sm font-medium transition ${
                isSelected ? 'bg-accent text-white' : 'bg-bg text-ink hover:bg-line'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
    </PickerShell>
  )
}

const YEARS_PER_PAGE = 12

/** Year picker — a 3×4 grid of years, paged 12 at a time. Used by the Stats page's "Jahr" tab. */
export function YearPickerModal({
  selectedYear,
  onSelect,
  onClose,
}: {
  selectedYear: number
  onSelect: (year: number) => void
  onClose: () => void
}) {
  const [pageStart, setPageStart] = useState(selectedYear - (selectedYear % YEARS_PER_PAGE))
  const years = Array.from({ length: YEARS_PER_PAGE }, (_, i) => pageStart + i)

  return (
    <PickerShell title="Jahr wählen" onClose={onClose}>
      <NavRow
        label={`${years[0]} – ${years[years.length - 1]}`}
        onPrev={() => setPageStart((y) => y - YEARS_PER_PAGE)}
        onNext={() => setPageStart((y) => y + YEARS_PER_PAGE)}
      />
      <div className="grid grid-cols-3 gap-2">
        {years.map((year) => (
          <button
            key={year}
            onClick={() => onSelect(year)}
            className={`rounded-xl py-3 text-sm font-medium transition ${
              year === selectedYear ? 'bg-accent text-white' : 'bg-bg text-ink hover:bg-line'
            }`}
          >
            {year}
          </button>
        ))}
      </div>
    </PickerShell>
  )
}
