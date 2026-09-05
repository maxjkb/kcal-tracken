import { useNavigate } from 'react-router-dom'
import { ChevronIcon } from './ChevronIcon'
import { useRegisterBackSwipe } from '../lib/backSwipe'

/**
 * Back-to-menu header shared by every settings sub-page — mirrors the iOS
 * Settings app's category detail screens.
 *
 * Uses `navigate(-1)` rather than a link to a fixed `/settings` route: the
 * Einstellungen menu is a Sheet now (SettingsSheet.tsx), not a page these
 * sub-pages could return to — the sheet closes itself the moment its own
 * category link is tapped (see SettingsSheet's onNavigate), so "back" from a
 * sub-page has always meant "wherever the sheet was opened from", which is
 * exactly what history back gives.
 */
export function SettingsBackHeader({ title }: { title: string }) {
  const navigate = useNavigate()
  // Every settings sub-page renders this header, so registering the back
  // gesture here covers all of them at once — swiping right does what the
  // arrow beside the title does.
  useRegisterBackSwipe(() => navigate(-1))

  return (
    <div className="mb-4 flex items-center gap-3">
      <button
        type="button"
        onClick={() => navigate(-1)}
        aria-label="Zurück"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface text-ink-soft shadow-sm shadow-black/5 hover:text-ink"
      >
        <ChevronIcon direction="left" />
      </button>
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{title}</h1>
    </div>
  )
}
