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
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  /** Floor for the auto-grown height — used to align the field with a control column beside it. */
  minHeight?: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const next = Math.min(Math.max(el.scrollHeight, minHeight), MAX_HEIGHT_PX)
    el.style.height = `${next}px`
  }, [value, minHeight])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={{ minHeight, maxHeight: MAX_HEIGHT_PX }}
      className={`resize-none overflow-y-auto ${className}`}
    />
  )
}
