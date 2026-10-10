import { describe, expect, it, vi } from 'vitest'

import { enterAliceHome, needsAliceName, preferredAliceName } from './aliceEntry'
import { DEFAULT_PREFERENCES } from './types'
describe('Alice preferred-name to Home entry', () => {
  it.each([null, {}, 42, '', '  ', 'x'.repeat(61), 'name' + String.fromCharCode(0)])(
    'rejects corrupt/blank names safely',
    (value) => expect(preferredAliceName(value)).toBe(''),
  )
  it('preserves full capitalization and accents', () =>
    expect(preferredAliceName('  Ana LUÍSA da Silva  ')).toBe('Ana LUÍSA da Silva'))
  it('first run opens existing Welcome on Home without changing workspace data', () => {
    const profile = { preferences: structuredClone(DEFAULT_PREFERENCES), setPreferences: vi.fn() },
      ui = { setActiveView: vi.fn(), openModal_: vi.fn(), closeModal: vi.fn() }
    enterAliceHome(profile, ui)
    expect(ui.setActiveView).toHaveBeenCalledWith('home')
    expect(ui.openModal_).toHaveBeenCalledWith('welcome')
    expect(ui.closeModal).not.toHaveBeenCalled()
    expect(profile.setPreferences).toHaveBeenCalledWith(
      expect.objectContaining({ alwaysStartOnHome: true, firstLaunchAt: expect.any(Number) }),
    )
  })
  it('completed profile starts Home and does not reprompt even with legacy workspace preference', () => {
    const profile = {
        preferences: {
          ...DEFAULT_PREFERENCES,
          displayName: 'Kleber',
          onboardingDone: true,
          alwaysStartOnHome: false,
        },
        setPreferences: vi.fn(),
      },
      ui = { setActiveView: vi.fn(), openModal_: vi.fn(), closeModal: vi.fn() }
    enterAliceHome(profile, ui)
    expect(ui.setActiveView).toHaveBeenCalledWith('home')
    expect(ui.openModal_).not.toHaveBeenCalled()
    expect(ui.closeModal).toHaveBeenCalledOnce()
    expect(needsAliceName(profile.preferences)).toBe(false)
  })
  it('each profile has its own completion/name and malformed names require Welcome', () => {
    const completed = { ...DEFAULT_PREFERENCES, displayName: 'Profile A', onboardingDone: true }
    expect(needsAliceName(completed)).toBe(false)
    expect(needsAliceName({ ...DEFAULT_PREFERENCES, displayName: '' })).toBe(true)
    expect(needsAliceName({ ...completed, displayName: {} as string })).toBe(true)
    expect(completed.displayName).toBe('Profile A')
  })
})
