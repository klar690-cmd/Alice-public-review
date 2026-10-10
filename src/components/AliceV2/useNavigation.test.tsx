import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDemoWorkspace } from '../../preview/data'
import { activeTeam } from '../../stores/aliceV2UiStore'
import { useProjectsStore } from '../../stores/projectsStore'
import { useUiStore } from '../../stores/uiStore'
import { useAliceV2Navigation } from './useNavigation'

beforeEach(() => {
  useProjectsStore.setState({
    ...createDemoWorkspace(),
    activeProfileId: 'default',
    hydrated: true,
  })
  useUiStore.getState().setActiveView('home')
})
afterEach(cleanup)
describe('R256 standard App routing', () => {
  it('isolates provider preferences across existing project/profile slots and restores the right draft', () => {
    act(() => useProjectsStore.setState({ activeProjectId: 'projectA' }))
    const { result } = renderHook(() => useAliceV2Navigation())
    act(() => result.current.store.getState().updateProvider('GG', { providerId: 'codex' }))
    const first = result.current.store
    act(() => useProjectsStore.setState({ activeProjectId: 'projectB' }))
    expect(result.current.store).not.toBe(first)
    expect(activeTeam(result.current.store.getState()).providerSettings.GG.providerId).toBe('fake')
    expect(activeTeam(result.current.store.getState()).providerSettings.GG.scope.projectId).toBe(
      'projectB',
    )
    act(() => useProjectsStore.setState({ activeProjectId: 'projectA' }))
    expect(result.current.store).toBe(first)
    expect(activeTeam(result.current.store.getState()).providerSettings.GG.providerId).toBe('codex')
  })
  it('starts on Home and adds a labeled agent route without replacing original accounts', () => {
    const { result } = renderHook(() => useAliceV2Navigation())
    expect(result.current.enabled).toBe(false)
    expect(result.current.entry.replaceViewId).toBeUndefined()
    expect(result.current.entry.label).toBe('Agentes e ligações')
    act(() => result.current.enter())
    expect(result.current.enabled).toBe(true)
    expect(result.current.store.getState().view).toBe('editor')
  })
  it('account/API choices remain isolated in actual App project/profile navigation', () => {
    act(() => useProjectsStore.setState({ activeProjectId: 'projectA' }))
    const { result } = renderHook(() => useAliceV2Navigation())
    act(() =>
      result.current.store
        .getState()
        .updateProvider('GG', { providerId: 'claude', method: 'account-login' }),
    )
    const first = result.current.store
    act(() => useProjectsStore.setState({ activeProjectId: 'projectB' }))
    expect(activeTeam(result.current.store.getState()).providerSettings.GG.method).toBe('simulated')
    act(() =>
      result.current.store
        .getState()
        .updateProvider('GG', { providerId: 'codex', method: 'api-key' }),
    )
    act(() => useProjectsStore.setState({ activeProfileId: 'profileB' }))
    expect(activeTeam(result.current.store.getState()).providerSettings.GG.providerId).toBe('fake')
    act(() =>
      useProjectsStore.setState({ activeProfileId: 'default', activeProjectId: 'projectA' }),
    )
    expect(result.current.store).toBe(first)
    expect(activeTeam(first.getState()).providerSettings.GG).toMatchObject({
      providerId: 'claude',
      method: 'account-login',
      connected: false,
      executable: false,
    })
  })
  it('preserves a draft and fake run when navigating Home and reopening the plug', () => {
    const { result } = renderHook(() => useAliceV2Navigation())
    act(() => {
      result.current.enter()
      result.current.store.getState().send('Local request', 'Local reply')
    })
    const run = activeTeam(result.current.store.getState()).run
    act(() => result.current.leave())
    act(() => result.current.enter())
    expect(activeTeam(result.current.store.getState()).run).toBe(run)
    expect(result.current.store.getState().view).toBe('editor')
  })
  it('yields to the original workspace when an existing agent panel is opened', () => {
    const { result } = renderHook(() => useAliceV2Navigation())
    act(() => result.current.enter())
    act(() => useUiStore.getState().setActiveView('workspace'))
    expect(result.current.enabled).toBe(false)
    expect(useUiStore.getState().activeView).toBe('workspace')
  })
  it('does not reuse one profile demo graph in another profile', () => {
    const { result } = renderHook(() => useAliceV2Navigation())
    act(() => {
      result.current.enter()
      result.current.store.getState().updateNode('Dev', { label: 'Private draft' })
    })
    act(() => useProjectsStore.setState({ activeProfileId: 'second' }))
    expect(result.current.enabled).toBe(false)
    expect(activeTeam(result.current.store.getState()).labels.Dev.label).toBe('Dev')
    expect(activeTeam(result.current.store.getState()).graph.scope.profileId).toMatch(
      /^profile_[a-f0-9]{48}$/,
    )
  })
  it('keeps numeric and long native profile IDs valid and distinct without changing the account ID', () => {
    const { result } = renderHook(() => useAliceV2Navigation())
    const ids = ['12fa5b71-1234-4321-9876-123456789abc', 'profile_' + 'x'.repeat(110)]
    const scopes: string[] = []
    for (const id of ids) {
      act(() => useProjectsStore.setState({ activeProfileId: id }))
      expect(useProjectsStore.getState().activeProfileId).toBe(id)
      const graph = activeTeam(result.current.store.getState()).graph
      expect(graph.scope.profileId).toMatch(/^profile_[a-f0-9]{48}$/)
      scopes.push(graph.scope.profileId)
    }
    expect(scopes[0]).not.toBe(scopes[1])
    act(() => useProjectsStore.setState({ activeProfileId: ids[0] }))
    expect(activeTeam(result.current.store.getState()).graph.scope.profileId).toBe(scopes[0])
  })
})
