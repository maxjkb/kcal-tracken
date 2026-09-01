import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronIcon } from './ChevronIcon'
import { CURRENT_VERSION } from '../lib/releaseNotes'
import { getApiKey } from '../lib/settings'
import { computeDailyTargets, getBodyProfile } from '../lib/bodyProfile'
import { isStoragePersisted } from '../lib/persistence'
import { onAuthChange } from '../lib/firebase'
import { GlassSurface } from '../glass/GlassSurface'
import { Sheet } from './Sheet'

/**
 * The Einstellungen root — was its own page (src/pages/SettingsPage.tsx,
 * removed), now a Sheet opened from PageHeader's gear button on every main
 * page (see hooks/useSettingsSheet.ts). A category menu (icon, title,
 * current-status subtitle, chevron) mirroring iOS's own Settings app: tap a
 * category to drill into its detail screen (src/pages/settings/*), which
 * stays a real route — only this top-level menu became a sheet, the eight
 * sub-pages are unaffected and still navigate/back exactly as before.
 *
 * Each row now carries its own identity color (index.css's
 * --color-settings-* tokens) instead of every icon sharing plain
 * --color-accent — see the block comment there for why a settings menu is
 * exempt from the macro/meal palette's photo-derived discipline.
 */
export function SettingsSheet({ onClose, dismiss }: { onClose: () => void; dismiss: boolean }) {
  return (
    <Sheet
      onClose={onClose}
      // Driven by the route rather than by an internal tap: see Sheet's
      // `dismiss`. Without it the search param disappearing would unmount
      // this sheet outright, skipping its slide-out.
      dismiss={dismiss}
      // This sheet's open state is a search param App reads, not a marker
      // entry — see Sheet.tsx's `manageHistory` and App.tsx's settingsOpen.
      manageHistory={false}
      sheetClassName="glass flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl"
    >
      <div className="min-h-0 overflow-y-auto p-5 pt-7 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        <h2 className="mb-4 text-lg font-semibold text-ink">Einstellungen</h2>
        <SettingsMenu />
      </div>
    </Sheet>
  )
}

function SettingsMenu() {

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

  const [syncEmail, setSyncEmail] = useState<string | null>(null)
  useEffect(() => onAuthChange((user) => setSyncEmail(user?.email ?? null)), [])
  const syncSubtitle = syncEmail ? `Angemeldet als ${syncEmail}` : 'Nicht angemeldet'

  return (
    <>
      <GlassSurface rim={22} className="glass-subtle divide-y divide-line/60 overflow-hidden rounded-3xl shadow-sm shadow-black/5">
        <SettingsRow
          to="/settings/koerperwerte"
          color="var(--color-settings-body)"
          icon={<BodyIcon />}
          title="Körperwerte & Ziele"
          subtitle={bodyProfileSubtitle}
        />
        <SettingsRow
          to="/settings/api"
          color="var(--color-settings-api)"
          icon={<KeyIcon />}
          title="Gemini API"
          subtitle={apiKeySubtitle}
        />
        <SettingsRow
          to="/settings/speicher"
          color="var(--color-settings-storage)"
          icon={<StorageIcon />}
          title="Speicher"
          subtitle={storageSubtitle}
        />
        <SettingsRow
          to="/settings/daten"
          color="var(--color-settings-data)"
          icon={<DataIcon />}
          title="Daten"
          subtitle="Backup & Zurücksetzen"
        />
        <SettingsRow
          to="/settings/sync"
          color="var(--color-settings-sync)"
          icon={<SyncIcon />}
          title="Sync"
          subtitle={syncSubtitle}
        />
        <SettingsRow
          to="/settings/kontingent"
          color="var(--color-settings-quota)"
          icon={<GaugeIcon />}
          title="Kontingent"
          subtitle="Anfragen an Gemini & Firebase heute"
        />
      </GlassSurface>

      {/* Its own group: these two are about the app itself rather than about
          your data or your account, and the separation is what makes a menu
          scannable rather than a list to read through. */}
      <GlassSurface rim={22} className="glass-subtle mt-6 divide-y divide-line/60 overflow-hidden rounded-3xl shadow-sm shadow-black/5">
        <SettingsRow
          to="/settings/aktualisierung"
          color="var(--color-settings-update)"
          icon={<DownloadIcon />}
          title="Aktualisierung"
          subtitle="Nach neuer Version suchen"
        />
        <SettingsRow
          to="/settings/version"
          color="var(--color-settings-about)"
          icon={<InfoIcon />}
          title="Version & Neues"
          subtitle={`Version ${CURRENT_VERSION}`}
        />
      </GlassSurface>
    </>
  )
}

function SettingsRow({
  to,
  icon,
  color,
  title,
  subtitle,
}: {
  to: string
  icon: ReactNode
  /** A --color-settings-* custom property, applied as this row's own icon-badge color (index.css). */
  color: string
  title: string
  subtitle: string
}) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 py-3.5 active:bg-bg">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
        style={{ background: color }}
      >
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

function GaugeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <path strokeLinecap="round" d="M4 18a8 8 0 1 1 16 0" />
      <path strokeLinecap="round" d="m12 14 4-4" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v10m0 0 4-4m-4 4-4-4" />
      <path strokeLinecap="round" d="M4 17v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M12 11v5" />
      <circle cx="12" cy="7.75" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  )
}
