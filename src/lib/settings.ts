import { pushApiKeyChange } from './sync'

const API_KEY_STORAGE_KEY = 'kcal-tracker:gemini-api-key'

export function getApiKey(): string | null {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY)
  } catch {
    return null
  }
}

export function setApiKey(key: string): void {
  const trimmed = key.trim()
  localStorage.setItem(API_KEY_STORAGE_KEY, trimmed)
  pushApiKeyChange(trimmed)
}

export function clearApiKey(): void {
  localStorage.removeItem(API_KEY_STORAGE_KEY)
  pushApiKeyChange(null)
}
