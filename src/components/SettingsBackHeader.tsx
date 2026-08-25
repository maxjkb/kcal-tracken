import { Link, useNavigate } from 'react-router-dom'
import { ChevronIcon } from './ChevronIcon'
import { useRegisterBackSwipe } from '../lib/backSwipe'

/** Back-to-menu header shared by every settings sub-page — mirrors the iOS Settings app's category detail screens. */
export function SettingsBackHeader({ title }: { title: string }) {
  const navigate = useNavigate()
  // Every settings sub-page renders this header, so registering the back
  // gesture here covers all of them at once — swiping right does what the
  // arrow beside the title does.
  useRegisterBackSwipe(() => navigate('/settings'))

  return (
    <div className="mb-4 flex items-center gap-3">
      <Link
        to="/settings"
        aria-label="Zurück zu Einstellungen"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink-soft shadow-sm shadow-black/5 hover:text-ink"
      >
        <ChevronIcon direction="left" />
      </Link>
      <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
    </div>
  )
}
