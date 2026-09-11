/**
 * Icon set for ExpandablePicker's two call sites (Supps' Heute/Vorschläge/
 * Score/Katalog tabs, Stats' Tag/Woche/Monat/Jahr periods) — Round 4 (v2.4):
 * these used to be plain text labels, explicit feedback asked for icons
 * instead. Same stroke-based, 24×24-viewBox language as the header icons in
 * PageHeader.tsx (not MacroIcon's hand-traced filled style, which reads as a
 * nutrient pictogram, a different vocabulary than a tab needs).
 *
 * The Stats period icons deliberately share one visual idea — a dot count
 * that grows with the span (one dot for a day, all the way to a full grid
 * for a year) — so the four read as a single scaling sequence at a glance
 * rather than four unrelated glyphs.
 */

const STROKE = { fill: 'none', stroke: 'currentColor', strokeWidth: 2 } as const

export function TodayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" {...STROKE} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m9 12.2 2 2 4-4.4" />
    </svg>
  )
}

export function SuggestionIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" {...STROKE} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 18h6M10 21h4M8 14.5A5.5 5.5 0 1 1 16 14.5c-.9.9-1.5 1.8-1.5 3H9.5c0-1.2-.6-2.1-1.5-3Z" />
    </svg>
  )
}

export function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" {...STROKE} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
      <path strokeLinecap="round" d="M8 5H5a3 3 0 0 0 3 4M16 5h3a3 3 0 0 1-3 4M12 12v3M9 19h6M10 19v-2.5a2 2 0 0 1 4 0V19" />
    </svg>
  )
}

export function CatalogIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" {...STROKE} className={className}>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  )
}

export function DayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" {...STROKE} className={className}>
      <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function WeekIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" {...STROKE} className={className}>
      <circle cx="6" cy="12" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="2.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function MonthIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" {...STROKE} className={className}>
      {[6, 12, 18].flatMap((cx) => [9, 15].map((cy) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.7" fill="currentColor" stroke="none" />))}
    </svg>
  )
}

export function YearIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" {...STROKE} className={className}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      {[8, 12, 16].flatMap((cx) => [8, 12, 16].map((cy) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.1" fill="currentColor" stroke="none" />))}
    </svg>
  )
}

/** "Alles" — the fifth Statistik period, the entire recorded history. An infinity glyph rather than a bigger dot-grid: the other four scale by count, but there's no fixed count for "everything". */
export function AllIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" {...STROKE} className={className}>
      <path d="M7 9a3 3 0 1 0 0 6c1.7 0 3-1.5 5-3s3.3-3 5-3a3 3 0 1 1 0 6c-1.7 0-3-1.5-5-3s-3.3-3-5-3Z" />
    </svg>
  )
}
