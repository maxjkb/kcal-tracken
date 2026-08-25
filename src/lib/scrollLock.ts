/**
 * Freezes the page behind a modal sheet.
 *
 * `overflow: hidden` on <body> alone is not enough on iOS Safari, which
 * happily keeps scrolling the document underneath a fixed overlay — the
 * single most visible "this is a website, not an app" tell a sheet can have.
 * Pinning the body with `position: fixed` and a negative `top` is the
 * approach that actually holds there; the offset preserves the scroll
 * position, which `position: fixed` would otherwise reset to the top.
 *
 * Reference-counted because sheets stack: opening the date picker from inside
 * the meal editor must not let the editor's own unlock, on close, unfreeze the
 * page while the editor is still open.
 */

let depth = 0
let savedScrollY = 0
let savedStyles: { position: string; top: string; left: string; right: string; width: string; overscrollBehavior: string } | null = null

export function lockBodyScroll(): void {
  depth += 1
  if (depth > 1) return

  savedScrollY = window.scrollY
  const style = document.body.style
  savedStyles = {
    position: style.position,
    top: style.top,
    left: style.left,
    right: style.right,
    width: style.width,
    overscrollBehavior: style.overscrollBehavior,
  }

  style.position = 'fixed'
  style.top = `-${savedScrollY}px`
  style.left = '0'
  style.right = '0'
  style.width = '100%'
  // Stops a scroll that runs out of room inside the sheet from chaining
  // outward into the document (and, on iOS, into pull-to-refresh).
  style.overscrollBehavior = 'none'
}

export function unlockBodyScroll(): void {
  depth = Math.max(0, depth - 1)
  if (depth > 0 || !savedStyles) return

  const style = document.body.style
  style.position = savedStyles.position
  style.top = savedStyles.top
  style.left = savedStyles.left
  style.right = savedStyles.right
  style.width = savedStyles.width
  style.overscrollBehavior = savedStyles.overscrollBehavior
  savedStyles = null

  // Restoring the styles alone leaves the document at the top — put the user
  // back exactly where they were, without a smooth-scroll animation.
  window.scrollTo({ top: savedScrollY, behavior: 'instant' as ScrollBehavior })
}
