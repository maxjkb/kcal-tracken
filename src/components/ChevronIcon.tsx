/** SVG chevrons instead of "‹"/"›" text glyphs — guarantees pixel-perfect centering regardless of font metrics. */
export function ChevronIcon({ direction, className = 'h-4 w-4' }: { direction: 'left' | 'right'; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d={direction === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
    </svg>
  )
}
