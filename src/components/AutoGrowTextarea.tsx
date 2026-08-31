import { useEffect, useRef } from 'react'

const DEFAULT_MIN_HEIGHT_PX = 76 // ~3 rows
const MAX_HEIGHT_PX = 220 // beyond this, scroll instead of growing further

/**
 * A textarea that grows with its content up to MAX_HEIGHT_PX, then becomes
 * scrollable — so short entries stay compact while long dictated/typed
 * descriptions remain comfortably scrollable instead of pushing the rest of
 * the sheet off-screen.
 */
export function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
  disabled,
  className = '',
  minHeight = DEFAULT_MIN_HEIGHT_PX,
  onWrappedChange,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  /** Floor for the auto-grown height — used to align the field with a control column beside it. */
  minHeight?: number
  /**
   * Fires when the content starts (or stops) needing more than the single
   * `minHeight` line. Measured rather than derived from the text, because
   * whether a given string wraps depends on the field's rendered width —
   * MealEditor uses it to move the dictation button out of the field.
   */
  onWrappedChange?: (wrapped: boolean) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const wrappedRef = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const content = el.scrollHeight
    const next = Math.min(Math.max(content, minHeight), MAX_HEIGHT_PX)
    el.style.height = `${next}px`
    // 2px of slack: a single line's scrollHeight can land a hair above
    // minHeight through sub-pixel rounding, which would otherwise report a
    // wrap the moment the field is focused.
    const wrapped = content > minHeight + 2
    if (wrapped !== wrappedRef.current) {
      wrappedRef.current = wrapped
      onWrappedChange?.(wrapped)
    }
  }, [value, minHeight, onWrappedChange])

  return (
    <textarea
      ref={ref}
      // A textarea defaults to rows=2, which puts a two-line floor under
      // scrollHeight — a one-line field would measure 64px and report itself
      // as already wrapped before a single character is typed. `minHeight`
      // is what actually sets the resting height; this just stops the
      // element's own default from overriding it upward.
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={{ minHeight, maxHeight: MAX_HEIGHT_PX }}
      className={`resize-none overflow-y-auto ${className}`}
    />
  )
}
