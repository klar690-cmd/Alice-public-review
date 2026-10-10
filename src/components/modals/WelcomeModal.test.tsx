import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  preferences: {
    displayName: '',
    firstLaunchAt: null as number | null,
    profileImageUrl: '',
    language: 'pt-BR' as const,
  },
  setPreferences: vi.fn(),
}))
const ui = vi.hoisted(() => ({
  openModal: 'welcome' as string | null,
  closeModal: vi.fn(),
  setActiveView: vi.fn(),
}))

vi.mock('../../stores/projectsStore', () => ({
  useProjectsStore: (selector: (state: typeof store) => unknown) => selector(store),
}))
vi.mock('../../stores/uiStore', () => ({
  useUiStore: Object.assign((selector: (state: typeof ui) => unknown) => selector(ui), {
    getState: () => ui,
  }),
}))

import { WelcomeModal } from './WelcomeModal'

beforeEach(() => {
  vi.clearAllMocks()
  store.preferences.displayName = ''
  ui.openModal = 'welcome'
})
afterEach(cleanup)

describe('Welcome preferred name', () => {
  it('saves the complete chosen name with its capitalization and trims only the edges', () => {
    render(<WelcomeModal />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Como quer ser chamado?' }), {
      target: { value: '  Ana LUÍSA da Silva  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
    expect(store.setPreferences).toHaveBeenCalledWith({
      displayName: 'Ana LUÍSA da Silva',
      accountCreated: true,
      onboardingDone: true,
      alwaysStartOnHome: true,
    })
    expect(ui.setActiveView).toHaveBeenCalledWith('home')
    expect(ui.closeModal).toHaveBeenCalledTimes(1)
  })

  it('does not save or close when the submitted name is whitespace', () => {
    render(<WelcomeModal />)
    const input = screen.getByRole('textbox', { name: 'Como quer ser chamado?' })
    fireEvent.change(input, { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: 'Começar' })).toBeDisabled()
    fireEvent.submit(input.closest('form')!)
    expect(store.setPreferences).not.toHaveBeenCalled()
    expect(ui.closeModal).not.toHaveBeenCalled()
  })

  it('skips without overwriting the saved name with an unfinished edit', () => {
    store.preferences.displayName = 'Kleber'
    render(<WelcomeModal />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Como quer ser chamado?' }), {
      target: { value: 'Unfinished edit' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }))
    expect(store.setPreferences).not.toHaveBeenCalled()
    expect(ui.closeModal).toHaveBeenCalledTimes(1)
  })

  it('reloads the saved name when Welcome is reopened after cancelling a draft', () => {
    store.preferences.displayName = 'Kleber'
    const view = render(<WelcomeModal />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Como quer ser chamado?' }), {
      target: { value: 'Discarded draft' },
    })
    ui.openModal = null
    view.rerender(<WelcomeModal />)
    store.preferences.displayName = 'Ana Luísa'
    ui.openModal = 'welcome'
    view.rerender(<WelcomeModal />)
    expect(screen.getByRole('textbox', { name: 'Como quer ser chamado?' })).toHaveValue('Ana Luísa')
  })
})
