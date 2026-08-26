import { useState } from 'react'

/**
 * A numeric input that survives being typed into.
 *
 * `<input type="number">` cannot be used for this. Mid-typing, "12." is not a
 * valid floating-point number, so the browser reports `value === ""` — and the
 * usual `Number(e.target.value) || 0` turns that into 0, which React then
 * writes back into the field as "0", wiping the digits already typed. The
 * result was that no fractional value could be entered anywhere in the app:
 * not 0.5 EL, not a protein figure with a decimal, despite `inputMode="decimal"`
 * inviting exactly that.
 *
 * `type="text"` with `inputMode="decimal"` keeps the numeric keypad on iOS
 * while leaving the raw text alone. What was typed is held here while the
 * field is being edited and only replaced by the canonical number once focus
 * leaves, so an in-progress "12." or "0," stays on screen instead of being
 * rewritten under the cursor.
 *
 * A comma is accepted as a decimal separator: this is a German-language app,
 * and the iOS decimal keypad offers whichever separator the device locale
 * uses.
 */
export function NumberField({
  value,
  onChange,
  className = '',
  ariaLabel,
}: {
  value: number
  onChange: (value: number) => void
  className?: string
  ariaLabel?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)

  function handleChange(raw: string) {
    setDraft(raw)
    const normalized = raw.replace(',', '.').trim()
    if (normalized === '') {
      onChange(0)
      return
    }
    const parsed = Number(normalized)
    // An unparseable intermediate ("12.", "-", ".") keeps the last good number
    // rather than collapsing the field to zero.
    if (Number.isFinite(parsed) && parsed >= 0) onChange(parsed)
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={draft ?? (Number.isFinite(value) ? String(Math.round(value * 10) / 10) : '0')}
      onChange={(e) => handleChange(e.target.value)}
      onFocus={(e) => setDraft(e.target.value)}
      onBlur={() => setDraft(null)}
      className={className}
    />
  )
}
