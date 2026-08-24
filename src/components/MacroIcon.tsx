export type MacroType = 'kcal' | 'protein' | 'carbs' | 'fat'

/** Small monochrome pictograms — flame, fish, wheat ear, oil drops — used everywhere instead of text/letter abbreviations. */
export function MacroIcon({ type, className = 'h-3 w-3' }: { type: MacroType; className?: string }) {
  if (type === 'kcal') return <KcalIcon className={className} />
  if (type === 'protein') return <ProteinIcon className={className} />
  if (type === 'carbs') return <CarbsIcon className={className} />
  return <FatIcon className={className} />
}

function KcalIcon({ className }: { className: string }) {
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
      {/* flame */}
      <path d="M12 2.5c1 3 .5 4.3-1 6c-1.7 2-2.5 3.6-2.5 5.5a5 5 0 0 0 10 0c0-1.7-.6-2.8-1.7-4c.2 1.6-.4 2.6-1.3 3c.3-2.3-.4-3.6-1.8-5c-1 1.2-1.3 2-1.1 3.2c-1-1-1.3-2.3-.6-3.7c-1.2.7-1.7 1.7-1.7 3C10 8 10.6 5 12 2.5Z" />
    </svg>
  )
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
      {/* fish — body, tail fin, eye, mouth */}
      <path d="M2.5 12c2.2-4 5.8-6 9.3-6c3.7 0 6.7 2.3 8.2 6c-1.5 3.7-4.5 6-8.2 6c-3.5 0-7.1-2-9.3-6Z" />
      <path d="M20 12l3-3.5v7L20 12Z" />
      <circle cx="7.3" cy="10.7" r={0.7} fill="currentColor" stroke="none" />
      <path d="M9 15.5c1 .3 2 .3 3 0" />
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
      {/* two overlapping oil drops */}
      <path d="M8.5 4c2.3 3 4 5.6 4 7.6a4 4 0 0 1-8 0c0-2 1.7-4.6 4-7.6Z" />
      <path d="M15 8.3c1.9 2.5 3.2 4.6 3.2 6.2a3.9 3.9 0 0 1-7.6.8" />
    </svg>
  )
}
