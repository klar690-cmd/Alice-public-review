import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { themeContributions } from '../../lib/plugins/registry'
import { DEFAULT_PREFERENCES } from '../../lib/types'
import { CREAM_ROSE_THEME } from '../../plugins/theme-pack/creamRose'
import { useProjectsStore } from '../../stores/projectsStore'
import { useUiStore } from '../../stores/uiStore'
import { MainMenu } from '../MainMenu'
import { ThemePickerModal } from './ThemePickerModal'

vi.mock('../../lib/tauri', async (original) => ({
  ...(await original<object>()),
  recordAppEvent: vi.fn(),
  recordFrontendError: vi.fn(),
}))
let dispose: () => void
beforeEach(() => {
  useProjectsStore.setState({
    preferences: { ...structuredClone(DEFAULT_PREFERENCES), language: 'pt-BR' },
    hydrated: false,
  })
  useUiStore.setState({ openModal: 'themePicker', showMainMenu: true })
  const handle = themeContributions.add('r224-selector-test', CREAM_ROSE_THEME)
  dispose = () => handle.dispose()
})
afterEach(() => {
  cleanup()
  dispose()
})
describe('R224 theme controls', () => {
  it('exposes Original and Creme & Rosé as semantic pressed buttons with instant reversible state', () => {
    render(<ThemePickerModal />)
    const original = screen.getAllByRole('button', { name: /Original \/ Padrão Alethe/ })[0]
    const cream = screen.getByRole('button', { name: /Creme & Rosé.*Marfim/ })
    expect(original).toHaveAttribute('aria-pressed', 'true')
    expect(cream).toHaveAttribute('aria-pressed', 'false')
    cream.focus()
    expect(cream).toHaveFocus()
    fireEvent.click(cream)
    expect(cream).toHaveAttribute('aria-pressed', 'true')
    expect(useProjectsStore.getState().preferences.uiTheme).toBe('cream-rose')
    fireEvent.click(original)
    expect(original).toHaveAttribute('aria-pressed', 'true')
    expect(useProjectsStore.getState().preferences.uiTheme).toBe(DEFAULT_PREFERENCES.uiTheme)
  })
  it('makes theme selection discoverable in the production main menu', () => {
    render(<MainMenu />)
    fireEvent.click(screen.getByRole('button', { name: 'Escolher tema' }))
    expect(useUiStore.getState().openModal).toBe('themePicker')
    expect(useUiStore.getState().showMainMenu).toBe(false)
  })
})
