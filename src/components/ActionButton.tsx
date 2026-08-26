import type { ReactNode } from 'react'

/**
 * One round action in a compact action row.
 *
 * 44px, so a row of them clears the touch-target minimum without needing
 * labels beside each one — the accessible name lives on aria-label and the
 * tooltip. `primary` is the solid, filled treatment, reserved for the single
 * action that submits; the tinted default marks secondary shortcuts as the
 * same family at a lower weight, rather than several equal slabs competing for
 * the same attention.
 */
export function ActionButton({
  children,
  label,
  onClick,
  disabled,
  primary,
  active,
}: {
  children: ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  primary?: boolean
  /** Subtly filled, for a shortcut whose result is already in place (a photo has been taken). */
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
        primary
          ? 'bg-accent text-on-accent shadow-sm shadow-accent/30'
          : active
            ? 'bg-accent/25 text-accent'
            : 'bg-accent/12 text-accent hover:bg-accent/20'
      }`}
    >
      {children}
    </button>
  )
}
