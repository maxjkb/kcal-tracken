import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Wraps a text input (or a small composite row built around one, like a
 * textarea with buttons beside it) so that while something inside is
 * focused — and only then — it lifts out of the page's normal flow and
 * docks to the bottom of the viewport, directly above the on-screen
 * keyboard, the way Apple's own text fields do (Notes, Messages) instead
 * of sitting wherever it happened to land in the scrolled page, frequently
 * half-covered by the keyboard on a phone.
 *
 * For fields rendered directly on a page (Statistik-style content, not
 * inside a Sheet) ONLY — a field inside a Sheet must not use this. Sheet's
 * own outer wrapper is `position: fixed`, and its inner motion.div carries
 * `style={{ y }}` (a `transform`), which becomes the containing block for
 * any `position: fixed` DESCENDANT: this component's own fixed positioning
 * would resolve against that transformed div instead of the real viewport,
 * landing the field somewhere off-screen or clipped rather than at the
 * bottom of the screen. Sheet.tsx handles keyboard-docking for everything
 * inside it a different way instead — by padding its own outer wrapper
 * with the keyboard's height, which carries the whole sheet (and every
 * plain, never-repositioned field inside it) up together. See that
 * component's own comment on `keyboardOffset` for why.
 *
 * Tracks `visualViewport`, not `window.innerHeight`: only visualViewport
 * actually shrinks when the on-screen keyboard opens on iOS/Android — the
 * layout viewport (innerHeight) stays the full screen height throughout,
 * which is exactly the "field ends up behind the keyboard" bug this
 * replaces. Delegates focus tracking to one `focusin`/`focusout` listener
 * on the wrapper rather than needing a ref on the field itself, so this
 * works unmodified around a plain `<input>`, an `<AutoGrowTextarea>`, or a
 * whole row that also has a mic/send button beside the field.
 *
 * Ships the "3D-Effekt" (elevation/shadow, via .glass — the same floating-
 * chrome material every nav bar/sheet in the app already uses) and the
 * scroll-fade mask (a thin gradient strip right above the docked field, so
 * content passing under it fades out instead of being hard-clipped) as one
 * package with the docking itself — see .docked-field-active/.docked-field-
 * fade in index.css for both.
 */
export function DockedField({ children, className = '' }: { children: ReactNode; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [docked, setDocked] = useState(false)
  const [bottomOffset, setBottomOffset] = useState(0)
  const [reservedHeight, setReservedHeight] = useState<number | null>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const vv = window.visualViewport
    if (!wrap || !vv) return

    function updateOffset() {
      // How much of the layout viewport the keyboard currently covers —
      // 0 when it's closed, so this is a no-op (bottomOffset: 0) even if
      // these listeners fire while nothing is focused.
      const keyboardHeight = Math.max(0, window.innerHeight - vv!.height - vv!.offsetTop)
      setBottomOffset(keyboardHeight)
    }
    function onFocusIn(e: FocusEvent) {
      const target = e.target as HTMLElement
      if (!wrap!.contains(target)) return
      // Docking is for text entry specifically — a wrapped row can also
      // hold a mic/send button beside the field (see MealEditor), and
      // those never summon a keyboard, so focusing one shouldn't lift the
      // whole row for no reason.
      if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') return
      // Captured before the field lifts out of flow, so the placeholder
      // left behind (see the render below) holds exactly the space it's
      // vacating — nothing else on the page jumps.
      setReservedHeight(wrap!.getBoundingClientRect().height)
      setDocked(true)
      updateOffset()
    }
    function onFocusOut(e: FocusEvent) {
      // A focus move between two nodes both still inside this same wrapper
      // (e.g. textarea → its own send button) isn't a real blur.
      if (wrap!.contains(e.relatedTarget as Node)) return
      setDocked(false)
    }

    wrap.addEventListener('focusin', onFocusIn)
    wrap.addEventListener('focusout', onFocusOut)
    vv.addEventListener('resize', updateOffset)
    vv.addEventListener('scroll', updateOffset)
    return () => {
      wrap.removeEventListener('focusin', onFocusIn)
      wrap.removeEventListener('focusout', onFocusOut)
      vv.removeEventListener('resize', updateOffset)
      vv.removeEventListener('scroll', updateOffset)
    }
  }, [])

  return (
    <>
      {docked && reservedHeight !== null && <div style={{ height: reservedHeight }} aria-hidden="true" />}
      <div
        ref={wrapRef}
        className={`${className} ${docked ? 'docked-field-active glass' : ''}`}
        style={docked ? { bottom: bottomOffset } : undefined}
      >
        {docked && <div className="docked-field-fade" aria-hidden="true" />}
        {children}
      </div>
    </>
  )
}
