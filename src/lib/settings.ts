const API_KEY_STORAGE_KEY = 'kcal-tracker:anthropic-api-key'

export function getApiKey(): string | null {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY)
  } catch {
    return null
  }
}

export function setApiKey(key: string): void {
  localStorage.setItem(API_KEY_STORAGE_KEY, key.trim())
}

export function clearApiKey(): void {
  localStorage.removeItem(API_KEY_STORAGE_KEY)
}
