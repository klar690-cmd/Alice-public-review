import type { ThemeOption } from './themes'
import { DEFAULT_PREFERENCES } from './types'
/** Preserve valid plugin preferences even while their plugin is unavailable. */
export function normalizeStoredTheme(value: unknown): string {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value)
    ? value
    : DEFAULT_PREFERENCES.uiTheme
}
/** Keep the existing default and optional skin discoverable without losing any preset. */
export function prioritizeAliceThemes(options: ThemeOption[]): ThemeOption[] {
  const ids = [DEFAULT_PREFERENCES.uiTheme, 'cream-rose']
  return [
    ...ids.flatMap((id) => options.filter((option) => option.id === id)),
    ...options.filter((option) => !ids.includes(option.id)),
  ]
}
