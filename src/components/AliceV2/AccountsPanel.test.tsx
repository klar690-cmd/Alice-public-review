import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDemoConnections, createDemoWorkspace } from '../../preview/data'
import { useAliceStore } from '../../stores/aliceStore'
import { activeTeam, createAliceV2UiStore } from '../../stores/aliceV2UiStore'
import { useProjectsStore } from '../../stores/projectsStore'
import { useUiStore } from '../../stores/uiStore'
import { AccountsPanel } from './AccountsPanel'
import { LocaleContext } from './messages'
import { AliceV2Workspace } from './Workspace'

beforeEach(() => {
  localStorage.clear()
  useProjectsStore.setState({
    ...createDemoWorkspace(),
    activeProfileId: 'default',
    hydrated: true,
  })
  useAliceStore.getState().loadProfile('default', createDemoConnections())
  useUiStore.getState().closeModal()
  vi.stubGlobal('fetch', vi.fn())
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('R256 original accounts reachability', () => {
  it('renders the existing metadata and controls without requesting authentication or network', () => {
    const before = JSON.stringify(useAliceStore.getState().accounts)
    render(
      <LocaleContext.Provider value="pt-BR">
        <AccountsPanel />
      </LocaleContext.Provider>,
    )
    expect(screen.getByRole('region', { name: 'Contas e provedores' })).toBeInTheDocument()
    expect(screen.getByText('ChatGPT Account A')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Gerenciar conexões|Manage connections/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Perfis|Profiles/ })).toBeInTheDocument()
    expect(JSON.stringify(useAliceStore.getState().accounts)).toBe(before)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('retains the original settings and profiles handlers without altering account identity', () => {
    const ids = useAliceStore.getState().accounts.map((a) => a.accountId)
    render(
      <LocaleContext.Provider value="pt-BR">
        <AccountsPanel />
      </LocaleContext.Provider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Gerenciar conexões|Manage connections/ }))
    expect(useUiStore.getState().openModal).toBe('alice.connections.settings')
    act(() => useUiStore.getState().closeModal())
    fireEvent.click(screen.getByRole('button', { name: /Perfis|Profiles/ }))
    expect(useUiStore.getState().openModal).toBe('profiles')
    expect(useAliceStore.getState().accounts.map((a) => a.accountId)).toEqual(ids)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('switches between the real account surface and the graph without losing fake run or draft', () => {
    const store = createAliceV2UiStore()
    store.getState().send('Synthetic task', 'Local reply')
    store.getState().updateNode('Dev', { label: 'Builder' })
    const captured = activeTeam(store.getState()).run
    render(
      <LocaleContext.Provider value="pt-BR">
        <AliceV2Workspace store={store} />
      </LocaleContext.Provider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Contas e provedores', exact: true }))
    expect(screen.getByText('ChatGPT Account A')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Editor de nós', exact: true }))
    expect(activeTeam(store.getState()).labels.Dev.label).toBe('Builder')
    expect(activeTeam(store.getState()).run).toBe(captured)
    expect(fetch).not.toHaveBeenCalled()
  })
})
