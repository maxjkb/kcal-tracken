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
  badge,
}: {
  children: ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  primary?: boolean
  /** Subtly filled, for a shortcut whose result is already in place (a photo has been taken). */
  active?: boolean
  /**
   * Small count badge in the corner — how many of this button's own kind
   * are already attached (photos taken, products scanned), so that count is
   * visible without a preview of the thing itself sitting in the layout.
   * Round 4 (v2.4): replaces the photo preview MealEditor used to show
   * inline — explicit feedback that no image should appear anywhere while
   * editing, just a running count on the button that added it. Omitted or
   * 0 renders nothing.
   */
  badge?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={badge ? `${label} (${badge})` : label}
      title={label}
      className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
        primary
          ? 'bg-accent text-bg shadow-sm shadow-accent/30'
          : active
            ? 'bg-accent/25 text-accent'
            : 'bg-accent/12 text-accent hover:bg-accent/20'
      }`}
    >
      {children}
      {!!badge && (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-[11px] font-bold text-white ring-2 ring-bg"
        >
          {badge}
        </span>
      )}
    </button>
  )
}
