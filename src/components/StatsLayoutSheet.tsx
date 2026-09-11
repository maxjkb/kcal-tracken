import { useState } from 'react'
import { Sheet } from './Sheet'
import { STATS_TILE_META } from './StatsTileMeta'
import { getStatsLayout, setStatsLayout, type StatsTileKey } from '../lib/statsLayout'

/**
 * Reorders the Statistik feed's chart tiles — title + icon per row (per
 * explicit request: the order is picked by title and icon, not by dragging
 * a preview of the chart itself), moved with up/down buttons rather than a
 * drag gesture. Drag reordering was considered and dropped: this app has no
 * sortable-list primitive yet, and a hand-rolled one earns its complexity
 * only where dragging is the more natural gesture (this codebase's existing
 * hand-rolled gestures — ExpandablePicker's picker-row drag, DatePickerModal
 * — are all continuous, single-axis pointer tracking; reordering a list is
 * a different, considerably larger problem: drop-target detection, auto-
 * scroll, touch vs. mouse). Up/down arrows do the exact same job for a list
 * this short (7 rows) with a fraction of the code and no gesture ambiguity.
 * Saved immediately on every move (setStatsLayout), not on a separate
 * "Fertig" button — there is nothing else in this sheet to commit together.
 */
export function StatsLayoutSheet({ onClose }: { onClose: () => void }) {
  const [order, setOrder] = useState<StatsTileKey[]>(() => getStatsLayout())

  function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= order.length) return
    const next = [...order]
    ;[next[index], next[target]] = [next[target], next[index]]
    setOrder(next)
    setStatsLayout(next)
  }

  return (
    <Sheet onClose={onClose} sheetClassName="glass flex w-full max-w-lg flex-col rounded-t-3xl p-5 pt-7 sm:rounded-3xl">
      <h2 className="mb-1 text-lg font-semibold text-ink">Reihenfolge bearbeiten</h2>
      <p className="mb-4 text-xs text-ink-soft">Bestimmt, in welcher Reihenfolge die Diagramme im Statistik-Feed stehen.</p>
      <div className="flex flex-col gap-1.5">
        {order.map((key, i) => {
          const meta = STATS_TILE_META[key]
          const Icon = meta.icon
          return (
            <div key={key} className="flex items-center gap-3 rounded-2xl bg-bg px-3 py-2.5">
              <Icon className="h-4 w-4 shrink-0 text-ink-soft" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{meta.label}</span>
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label={`${meta.label} nach oben`}
                className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft disabled:opacity-25"
              >
                <ArrowIcon direction="up" />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === order.length - 1}
                aria-label={`${meta.label} nach unten`}
                className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft disabled:opacity-25"
              >
                <ArrowIcon direction="down" />
              </button>
            </div>
          )
        })}
      </div>
    </Sheet>
  )
}

function ArrowIcon({ direction }: { direction: 'up' | 'down' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d={direction === 'up' ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
    </svg>
  )
}
