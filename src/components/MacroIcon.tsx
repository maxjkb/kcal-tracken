export type MacroType = 'protein' | 'carbs' | 'fat'

/** Small monochrome pictograms — meat/bone, grain, oil drop — used in place of P/K/F letters. */
export function MacroIcon({ type, className = 'h-3 w-3' }: { type: MacroType; className?: string }) {
  if (type === 'protein') return <ProteinIcon className={className} />
  if (type === 'carbs') return <CarbsIcon className={className} />
  return <FatIcon className={className} />
}

function ProteinIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* egg — one simple outlined shape, same minimal style as the oil drop */}
      <path d="M12 3.5c4 1 6.5 5.5 6.5 10 0 4.5-2.9 7.5-6.5 7.5S5.5 18 5.5 13.5c0-4.5 2.5-9 6.5-10Z" />
    </svg>
  )
}

function CarbsIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* single grain of wheat/rice — one simple outlined shape, like the oil drop */}
      <ellipse cx="12" cy="12" rx="4.3" ry="8.3" transform="rotate(25 12 12)" />
      <path d="M12 4.5v15" transform="rotate(25 12 12)" />
    </svg>
  )
}

function FatIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* oil drop */}
      <path d="M12 3c3.2 4.2 6 8.2 6 11.2a6 6 0 0 1-12 0C6 11.2 8.8 7.2 12 3Z" />
    </svg>
  )
}
