/** Three dots bouncing in sequence — shown on a button while an AI call is in flight. */
export function BouncingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      <span className="dot-bounce" style={{ animationDelay: '0ms' }} />
      <span className="dot-bounce" style={{ animationDelay: '150ms' }} />
      <span className="dot-bounce" style={{ animationDelay: '300ms' }} />
    </span>
  )
}
