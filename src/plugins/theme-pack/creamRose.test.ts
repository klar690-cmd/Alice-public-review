import { describe, expect, it } from 'vitest'

import { getXtermTheme } from '../../components/XTermView/xtermThemes'
import { normalizeStoredTheme, prioritizeAliceThemes } from '../../lib/aliceAppearance'
import { themeContributions } from '../../lib/plugins/registry'
import { resolveAppliedTheme, themeOptions } from '../../lib/themes'
import { sanitizeThemeTokens, themeContributionToCss } from '../../lib/themeTokens'
import { DEFAULT_PREFERENCES } from '../../lib/types'
import { CREAM_ROSE_THEME } from './creamRose'

function luminance(hex: string) {
  const rgb = hex
    .slice(1)
    .match(/../g)!
    .map((x) => parseInt(x, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
}
function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
describe('R224 optional whole-app palette', () => {
  it('validates every token without CSS injection or network references', () => {
    expect(sanitizeThemeTokens(CREAM_ROSE_THEME.tokens)).toEqual(CREAM_ROSE_THEME.tokens)
    expect(themeContributionToCss(CREAM_ROSE_THEME)).toContain("[data-theme='cream-rose']")
    expect(themeContributionToCss(CREAM_ROSE_THEME)).not.toContain('url(')
  })
  it('provides AA text contrast on canvas, cards, hover and selected surfaces', () => {
    const t = CREAM_ROSE_THEME.tokens
    for (const bg of [
      '--bg',
      '--bg-elevated',
      '--panel',
      '--panel-hover',
      '--bg-sunken',
      '--accent-soft',
    ])
      for (const fg of [
        '--fg',
        '--fg-muted',
        '--fg-faint',
        '--accent',
        '--status-working',
        '--status-offline',
        '--status-waiting',
      ])
        expect(contrast(t[fg], t[bg]), fg + ' on ' + bg).toBeGreaterThanOrEqual(4.5)
    expect(contrast(t['--accent-on'], t['--accent'])).toBeGreaterThanOrEqual(4.5)
    expect(contrast(t['--action-on'], t['--action-bg'])).toBeGreaterThanOrEqual(4.5)
    expect(contrast(t['--focus-ring'], t['--bg'])).toBeGreaterThanOrEqual(3)
  })
  it('covers agent brands with readable colors and distinct semantic states', () => {
    const t = CREAM_ROSE_THEME.tokens
    for (const key of Object.keys(t).filter(
      (key) => /^--agent-/.test(key) && !key.endsWith('-soft'),
    ))
      expect(contrast(t[key], t['--bg']), key).toBeGreaterThanOrEqual(4.5)
    expect(t['--status-working']).not.toBe(t['--status-offline'])
  })
  it('has a complete readable ANSI palette without changing terminal font or metrics', () => {
    const terminal = CREAM_ROSE_THEME.terminal!
    for (const [key, color] of Object.entries(terminal))
      if (!['background', 'cursorAccent', 'selectionBackground'].includes(key))
        expect(contrast(color as string, terminal.background!), key).toBeGreaterThanOrEqual(4.5)
    for (const key of Object.keys(CREAM_ROSE_THEME.tokens))
      expect(key).not.toMatch(/^--(?:font-|radius-|anim-|ease-)/)
  })
  it('leaves defaults and built-in terminal palettes intact while enabling and reverting the skin', () => {
    const baseline = getXtermTheme('elite-indigo')
    const handle = themeContributions.add('r224-test', CREAM_ROSE_THEME)
    try {
      expect(DEFAULT_PREFERENCES.uiTheme).toBe('elite-indigo')
      expect(DEFAULT_PREFERENCES.terminalTheme).toBeNull()
      expect(resolveAppliedTheme('cream-rose', 'elite-indigo')).toBe('cream-rose')
      expect(getXtermTheme('cream-rose').background).toBe(CREAM_ROSE_THEME.terminal!.background)
      expect(getXtermTheme('elite-indigo')).toBe(baseline)
      expect(
        prioritizeAliceThemes(themeOptions())
          .slice(0, 2)
          .map((x) => x.id),
      ).toEqual(['elite-indigo', 'cream-rose'])
    } finally {
      handle.dispose()
    }
    expect(resolveAppliedTheme('cream-rose', 'elite-indigo')).toBe('elite-indigo')
  })
  it('falls back on corrupt selection while preserving safe unavailable plugin preferences', () => {
    for (const bad of [undefined, null, {}, 42, '', '../escape', 'bad;rule', 'bad url'])
      expect(normalizeStoredTheme(bad)).toBe('elite-indigo')
    expect(normalizeStoredTheme('cream-rose')).toBe('cream-rose')
    expect(normalizeStoredTheme('future-plugin')).toBe('future-plugin')
    expect(resolveAppliedTheme('future-plugin', 'elite-indigo')).toBe('elite-indigo')
  })
})
