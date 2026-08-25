import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronIcon } from '../components/ChevronIcon'
import { PageHeader } from '../components/PageHeader'
import { getApiKey } from '../lib/settings'
import { computeDailyTargets, getBodyProfile } from '../lib/bodyProfile'
import { isStoragePersisted } from '../lib/persistence'
import { getFirebaseConfig } from '../lib/firebaseConfig'
import { onAuthChange } from '../lib/firebase'

/**
 * The Einstellungen root — a category menu (icon, title, current-status
 * subtitle, chevron) instead of every section's full content at once,
 * mirroring iOS's own Settings app: tap a category to drill into its
 * detail screen (src/pages/settings/*).
 */
export function SettingsPage() {
  const bodyProfile = getBodyProfile()
  const bodyProfileSubtitle = bodyProfile
    ? `Ziel: ${computeDailyTargets(bodyProfile).kcal} kcal/Tag`
    : 'Nicht eingerichtet'

  const apiKeySubtitle = getApiKey() ? 'Konfiguriert' : 'Kein Key hinterlegt'

  const [persisted, setPersisted] = useState<boolean | null>(null)
  useEffect(() => {
    isStoragePersisted().then(setPersisted)
  }, [])
  const storageSubtitle = persisted === true ? 'Aktiv' : persisted === false ? 'Nicht aktiv' : 'Wird geprüft…'

  const firebaseConfig = getFirebaseConfig()
  const [syncEmail, setSyncEmail] = useState<string | null>(null)
  useEffect(() => {
    if (!getFirebaseConfig()) return
    return onAuthChange((user) => setSyncEmail(user?.email ?? null))
  }, [])
  const syncSubtitle = !firebaseConfig ? 'Nicht eingerichtet' : syncEmail ? `Angemeldet als ${syncEmail}` : 'Nicht angemeldet'

  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <PageHeader title="Einstellungen" showSettings={false} className="mb-4" />

      <div className="glass-subtle divide-y divide-line/60 overflow-hidden rounded-3xl shadow-sm shadow-black/5">
        <SettingsRow
          to="/settings/koerperwerte"
          iconBg="bg-accent"
          icon={<BodyIcon />}
          title="Körperwerte & Ziele"
          subtitle={bodyProfileSubtitle}
        />
        <SettingsRow
          to="/settings/api"
          iconBg="bg-accent"
          icon={<KeyIcon />}
          title="Gemini API"
          subtitle={apiKeySubtitle}
        />
        <SettingsRow
          to="/settings/speicher"
          iconBg="bg-accent"
          icon={<StorageIcon />}
          title="Speicher"
          subtitle={storageSubtitle}
        />
        <SettingsRow
          to="/settings/daten"
          iconBg="bg-accent"
          icon={<DataIcon />}
          title="Daten"
          subtitle="Backup & Zurücksetzen"
        />
        <SettingsRow
          to="/settings/sync"
          iconBg="bg-accent"
          icon={<SyncIcon />}
          title="Sync"
          subtitle={syncSubtitle}
        />
      </div>
    </div>
  )
}

function SettingsRow({
  to,
  icon,
  iconBg,
  title,
  subtitle,
}: {
  to: string
  icon: ReactNode
  iconBg: string
  title: string
  subtitle: string
}) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 py-3.5 active:bg-bg">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white ${iconBg}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block truncate text-xs text-ink-soft">{subtitle}</span>
      </span>
      <ChevronIcon direction="right" className="h-4 w-4 shrink-0 text-ink-faint" />
    </Link>
  )
}

function BodyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <circle cx="12" cy="6" r="3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 21c0-4 2.7-6.5 6-6.5S18 17 18 21" />
    </svg>
  )
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <circle cx="8" cy="15" r="4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 12l8-8m0 0h-4m4 0v4" />
    </svg>
  )
}

function StorageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <rect x="3" y="4" width="18" height="6" rx="2" />
      <rect x="3" y="14" width="18" height="6" rx="2" />
      <circle cx="7" cy="7" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="7" cy="17" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

function SyncIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 12a8 8 0 0 1 13.66-5.66M20 12a8 8 0 0 1-13.66 5.66" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.66 3v4h-4M6.34 21v-4h4" />
    </svg>
  )
}

function DataIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15V4m0 0-3.5 3.5M12 4l3.5 3.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </svg>
  )
}
