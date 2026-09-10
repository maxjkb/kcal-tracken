import type { ReactNode } from 'react'
import { GlassSurface } from '../glass/GlassSurface'

/**
 * A short status/placeholder line ("Lädt…", "Keine Mahlzeiten an diesem
 * Tag.", …) wrapped in the same glass material every other piece of text
 * sits on — never bare on the page.
 *
 * Round 3 (v2.3): every one of these used to be a plain `<p>` sitting
 * directly on the ambient background. That was fine against the old flat
 * canvas; against the busier "t"-texture (this round's other change) it
 * read as low-contrast and visually noisy — explicit feedback that *no*
 * text should float free of a tile anymore. This is the shared shape for
 * the recurring "short, muted, centered message" case; page titles and
 * section headers get their own tiles inline instead, since those carry
 * icons/actions alongside the text that this one-size shape doesn't fit.
 */
export function MessageTile({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <GlassSurface
      as="p"
      rim={14}
      className={`glass-subtle glass-subtle-themed inline-block rounded-2xl px-4 py-2.5 text-center text-sm text-ink-soft shadow-sm shadow-black/5 ${className}`}
    >
      {children}
    </GlassSurface>
  )
}
