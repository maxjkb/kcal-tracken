import { createContext, useContext } from 'react'

/**
 * Opens the Einstellungen sheet.
 *
 * Mirrors useAddMeal.ts exactly — same reasoning: the pages between App and
 * PageHeader's gear button are lazy-loaded route components with no other
 * reason to know about the sheet App owns, so a context reaches across that
 * gap instead of prop-drilling a callback through every page.
 */
export const SettingsSheetContext = createContext<(() => void) | null>(null)

export function useSettingsSheet(): () => void {
  const openSettings = useContext(SettingsSheetContext)
  if (!openSettings) throw new Error('useSettingsSheet must be used within SettingsSheetContext')
  return openSettings
}
