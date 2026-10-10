import { beforeEach, describe, expect, it, vi } from 'vitest'

import fixture from '../preview/canonical-r222.json'
import { createR219DemoConnections, createR222DemoWorkspace } from '../preview/data'
import { useAliceStore } from '../stores/aliceStore'
import { useProjectsStore } from '../stores/projectsStore'
import { useUiStore } from '../stores/uiStore'
import { assertCanonicalDispatch, parseRumoCanonical } from './aliceCanonical'
import { EMPTY_ALICE_STATE } from './aliceModel'
import { closeAlicePane } from './alicePaneLifecycle'
import { cleanupPtys } from './terminalLifecycle'
vi.mock('./terminalLifecycle', () => ({ cleanupPtys: vi.fn() }))
beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  useProjectsStore.setState({
    ...createR222DemoWorkspace(),
    activeProfileId: 'default',
    hydrated: true,
  })
  useAliceStore.setState({ ...structuredClone(EMPTY_ALICE_STATE), profileId: null })
  useAliceStore.getState().loadProfile('default', createR219DemoConnections())
  useUiStore.setState({ activeView: 'home', focusedTerminalId: null, openModal: null })
})
describe('Alice pane lifetime and original workspace behavior', () => {
  it('opens only chosen agents, closes one sibling safely and reopens without new IDs', () => {
    const initial = structuredClone(useAliceStore.getState().agents)
    const open = useAliceStore.getState().openLinkedAgent
    open('demo-agent-0')
    expect(useProjectsStore.getState().workspace.containers[0].paneIds).toEqual(['pane-0'])
    open('demo-agent-1')
    open('demo-agent-2')
    expect(useUiStore.getState().activeView).toBe('workspace')
    const sessions = structuredClone(useAliceStore.getState().sessions)
    closeAlicePane('alice-demo', 'pane-1')
    expect(useProjectsStore.getState().workspace.containers[0].paneIds).toEqual([
      'pane-0',
      'pane-2',
    ])
    expect(useAliceStore.getState().agents).toEqual(initial)
    expect(useAliceStore.getState().sessions).toEqual(sessions)
    expect(cleanupPtys).not.toHaveBeenCalled()
    open('demo-agent-1')
    open('demo-agent-1')
    expect(
      useProjectsStore.getState().workspace.containers[0].paneIds.filter((id) => id === 'pane-1'),
    ).toHaveLength(1)
    expect(useProjectsStore.getState().projects[0].terminals).toHaveLength(4)
  })
  it('last close returns Home but agent/session/pane records remain reopenable', () => {
    const open = useAliceStore.getState().openLinkedAgent
    open('demo-agent-2')
    closeAlicePane('alice-demo', 'pane-2')
    expect(useUiStore.getState().activeView).toBe('home')
    expect(useProjectsStore.getState().workspace.containers).toEqual([])
    expect(useAliceStore.getState().agents).toHaveLength(4)
    open('demo-agent-2')
    expect(useProjectsStore.getState().workspace.containers[0].paneIds).toEqual(['pane-2'])
  })
  it('safe native pane close keeps running handles while upstream destructive close is unchanged', () => {
    const p = useProjectsStore.getState().projects[0]
    p.terminals[3].tabs[0].ptyId = 'owned-pty'
    p.terminals[3].tabs[0].sessionId = 'owned-provider-thread'
    useAliceStore.getState().openLinkedAgent('demo-assistente')
    closeAlicePane('alice-demo', 'pane-pty')
    expect(p.terminals[3].tabs[0].ptyId).toBe('owned-pty')
    expect(useProjectsStore.getState().projects[0].terminals[3].tabs[0].sessionId).toBe(
      'owned-provider-thread',
    )
    expect(cleanupPtys).not.toHaveBeenCalled()
    useProjectsStore.getState().closePane('alice-demo', 'pane-pty')
    expect(cleanupPtys).toHaveBeenCalledWith(['owned-pty'])
    expect(useProjectsStore.getState().projects[0].terminals[3].tabs[0].ptyId).toBeNull()
  })
  it('records close/open state in existing workspace snapshots and keeps resize/layout choices', () => {
    const store = useAliceStore.getState()
    store.openLinkedAgent('demo-agent-0')
    store.openLinkedAgent('demo-agent-1')
    store.openLinkedAgent('demo-agent-2')
    useProjectsStore.getState().setLayoutMode('alice-demo', 'grid')
    closeAlicePane('alice-demo', 'pane-1')
    const state = useProjectsStore.getState(),
      tab = state.workspace.tabs.find((t) => t.id === state.workspace.activeTabId)!
    expect(tab.snapshot.containers[0].paneIds).not.toContain('pane-1')
    expect(state.projects[0].layoutMode).toBe('grid')
    const saved = JSON.parse(
      JSON.stringify({
        projects: state.projects,
        workspace: state.workspace,
        preferences: state.preferences,
      }),
    )
    expect(saved.workspace.containers[0].paneIds).toEqual(state.workspace.containers[0].paneIds)
    expect(
      saved.workspace.tabs.find((t: { id: string }) => t.id === saved.workspace.activeTabId)
        .snapshot.containers[0].paneIds,
    ).not.toContain('pane-1')
  })
  it('profile changes do not copy agent links; corrupt missing pane bindings fail closed', () => {
    useAliceStore.getState().loadProfile('empty')
    expect(useAliceStore.getState().agents).toEqual([])
    expect(() => useAliceStore.getState().openLinkedAgent('demo-agent-0')).toThrow()
    useAliceStore.getState().loadProfile('default')
    const before = useProjectsStore.getState().projects
    closeAlicePane('missing', 'missing')
    expect(useProjectsStore.getState().projects).toBe(before)
  })
  it('reads exact R223/task rev2/gen62 without relaxing revision or fixture checks', () => {
    const files = fixture as Record<string, string>,
      main = files['main:'],
      fixed = files['assistente/source-art-active:'],
      control = files[main + ':docs/coordination/CONTROL.md'],
      agent = files[fixed + ':docs/coordination/ASSISTENTE.md'],
      task =
        files[fixed + ':docs/coordination/PHASE_ASSISTENTE_R222_ALICE_PANEL_LIFECYCLE_UX_V1.md']
    const proof = { mainSha: main, fixedSha: fixed, readAt: Date.now(), fixture: true },
      snap = parseRumoCanonical(control, agent, task, proof)
    expect(snap).toMatchObject({
      taskRevision: 2,
      generation: 62,
      coordinationRevision: 'COORD-2026-10-08-R223',
      candidate: 'd7817bc1980ec5d8ec3f9191e6a8ddab7fda16f1',
    })
    expect(() => assertCanonicalDispatch(snap, snap)).toThrow()
    expect(() =>
      parseRumoCanonical(control.replace('COORD-2026-10-08-R223', 'mismatch'), agent, task, proof),
    ).toThrow()
  })
})
