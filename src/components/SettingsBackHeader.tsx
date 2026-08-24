import { Link } from 'react-router-dom'
import { ChevronIcon } from './ChevronIcon'

/** Back-to-menu header shared by every settings sub-page — mirrors the iOS Settings app's category detail screens. */
export function SettingsBackHeader({ title }: { title: string }) {
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
