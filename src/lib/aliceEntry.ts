import type { Preferences } from './types'
export function preferredAliceName(value: unknown): string {
  if (typeof value !== 'string') return ''
  const name = value.trim()
  return name && name.length <= 60 && !/[\u0000-\u001f\u007f]/.test(name) ? name : ''
}
export function needsAliceName(
  preferences: Pick<Preferences, 'displayName' | 'onboardingDone'>,
): boolean {
  return !preferredAliceName(preferences.displayName) || preferences.onboardingDone !== true
}
export function enterAliceHome(
  profile: { preferences: Preferences; setPreferences: (prefs: Partial<Preferences>) => void },
  ui: {
    setActiveView: (view: 'home') => void
    openModal_: (kind: 'welcome') => void
    closeModal: () => void
  },
): void {
  const name = preferredAliceName(profile.preferences.displayName)
  const patch: Partial<Preferences> = {}
  if (profile.preferences.displayName !== name) patch.displayName = name
  if (!profile.preferences.alwaysStartOnHome) patch.alwaysStartOnHome = true
  if (profile.preferences.firstLaunchAt === null) patch.firstLaunchAt = Date.now()
  if (Object.keys(patch).length) profile.setPreferences(patch)
  ui.setActiveView('home')
  if (needsAliceName({ ...profile.preferences, displayName: name })) ui.openModal_('welcome')
  else ui.closeModal()
}
