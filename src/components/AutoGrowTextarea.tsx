import { useEffect, useRef } from 'react'

const MIN_HEIGHT_PX = 76 // ~3 rows
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
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const next = Math.min(Math.max(el.scrollHeight, MIN_HEIGHT_PX), MAX_HEIGHT_PX)
    el.style.height = `${next}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={{ minHeight: MIN_HEIGHT_PX, maxHeight: MAX_HEIGHT_PX }}
      className={`resize-none overflow-y-auto ${className}`}
    />
  )
}
