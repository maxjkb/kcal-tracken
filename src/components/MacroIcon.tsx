export type MacroType = 'protein' | 'carbs' | 'fat'

/** Small monochrome pictograms — steak, wheat ear, oil drop — used in place of P/K/F letters. */
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
      {/* steak — irregular cut of meat with its bone cross-section visible in the middle */}
      <path d="M5.3 6c2.9-1.7 6.6-1.9 9.2-.1c2.7 1.9 3.9 5 2.9 7.9c-1 2.9-4 4.8-7.3 4.7c-3.3-.1-6.3-2.1-7.1-5C2.3 10.8 3 7.6 5.3 6Z" />
      <path d="M8.3 12.5h6M8.3 10.3v4.4M14.3 10.3v4.4" />
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
      {/* wheat ear — stem with two pairs of angled kernels and a pointed tip */}
      <path d="M12 21V8.5" />
      <path d="M12 3.8l2 4.2h-4z" fill="currentColor" stroke="none" />
      <ellipse cx="8.6" cy="11.8" rx="2.1" ry="0.95" transform="rotate(-38 8.6 11.8)" />
      <ellipse cx="15.4" cy="11.8" rx="2.1" ry="0.95" transform="rotate(38 15.4 11.8)" />
      <ellipse cx="8" cy="16" rx="2.3" ry="1" transform="rotate(-35 8 16)" />
      <ellipse cx="16" cy="16" rx="2.3" ry="1" transform="rotate(35 16 16)" />
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
