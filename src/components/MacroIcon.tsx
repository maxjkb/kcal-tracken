export type MacroType = 'protein' | 'carbs' | 'fat'

/** Small monochrome pictograms — meat/drumstick, wheat, oil drop — used in place of P/K/F letters everywhere in the app. */
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
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* drumstick: rounded meat with a bone handle */}
      <path d="M8.5 8.5a5.5 5.5 0 1 1 7 7c-2 2-5.5 3-9 3.5" />
      <path d="M11 12 5 18" />
      <circle cx="4" cy="19" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  )
}

function CarbsIcon({ className }: { className: string }) {
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
      {/* wheat stalk */}
      <path d="M12 21V8" />
      <path d="M12 8c-1.8-.6-2.8-2.2-2.4-4M12 8c1.8-.6 2.8-2.2 2.4-4" />
      <path d="M12 12.5c-1.8-.6-2.8-2.2-2.4-4M12 12.5c1.8-.6 2.8-2.2 2.4-4" />
      <path d="M12 17c-1.5-.5-2.3-1.9-2-3.4M12 17c1.5-.5 2.3-1.9 2-3.4" />
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
