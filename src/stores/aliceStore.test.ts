import { beforeEach, describe, expect, it, vi } from 'vitest'

import { requestN8n } from '../lib/aliceHttp'
import { EMPTY_ALICE_STATE } from '../lib/aliceModel'
import { createDemoConnections, createDemoWorkspace } from '../preview/data'
import { startAliceProfileSync, useAliceStore } from './aliceStore'
import { useProjectsStore } from './projectsStore'
vi.mock('../lib/aliceHttp', () => ({ requestN8n: vi.fn() }))
vi.mock('../lib/tauri', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  findCliLauncher: vi.fn(async () => 'codex.cmd'),
  ptyExists: vi.fn(async () => true),
}))
describe('Alice store/profile lifecycle', () => {
  beforeEach(() => {
    localStorage.clear()
    useAliceStore.setState({
      ...structuredClone(EMPTY_ALICE_STATE),
      profileId: null,
      lastEvent: null,
      canonical: null,
    })
    useProjectsStore.setState({
      ...createDemoWorkspace(),
      activeProfileId: 'default',
      hydrated: true,
    })
  })
  it('writes metadata to original profile and switches/reloads without copying it', () => {
    const stop = startAliceProfileSync()
    const store = useAliceStore.getState()
    const id = store.addAccount('Account', 'codex', 'cli-pty', '')
    store.addAgent(id, 'GG', 'Governance')
    useProjectsStore.setState({ activeProfileId: 'second' })
    expect(useAliceStore.getState().agents).toEqual([])
    useProjectsStore.setState({ activeProfileId: 'default' })
    expect(useAliceStore.getState().agents[0].displayName).toBe('GG')
    stop()
  })
  it('keeps many sessions for one agent and syncs provider handles from project store', () => {
    useAliceStore.getState().loadProfile('default', createDemoConnections())
    useAliceStore
      .getState()
      .bindTab('demo-assistente', 'alice-demo', 'pane-pty', 'demo-pty-disabled')
    expect(
      useAliceStore.getState().sessions.find((s) => s.agentId === 'demo-assistente')?.tabId,
    ).toBe('demo-pty-disabled')
    const stop = startAliceProfileSync()
    useProjectsStore
      .getState()
      .setSubTabSessionId('alice-demo', 'pane-pty', 'demo-pty-disabled', 'conversation')
    expect(
      useAliceStore.getState().sessions.find((s) => s.tabId === 'demo-pty-disabled')
        ?.providerHandle,
    ).toBe('conversation')
    stop()
  })
  it('does not publish a delayed health result into another profile', async () => {
    useAliceStore.getState().loadProfile('default', createDemoConnections())
    let resolve!: (result: { ok: boolean; status: number; error: null; attempts: number }) => void
    vi.mocked(requestN8n).mockReturnValue(
      new Promise((r) => {
        resolve = r
      }),
    )
    const pending = useAliceStore.getState().testN8n()
    useAliceStore.getState().loadProfile('second')
    resolve({ ok: true, status: 200, error: null, attempts: 1 })
    await pending
    expect(useAliceStore.getState().n8n.health).toBe('disconnected')
    expect(useAliceStore.getState().n8n.lastResult).toBeUndefined()
  })

  it('creates and resumes through original project-store actions, preserving many bound sessions', async () => {
    useAliceStore.getState().loadProfile('default', createDemoConnections())
    const create = vi.spyOn(useProjectsStore.getState(), 'createAgentTerminal')
    await useAliceStore.getState().createSession('demo-assistente', 'alice-demo')
    expect(create).toHaveBeenCalledWith(
      'alice-demo',
      expect.objectContaining({
        name: 'ASSISTENTE/WORK',
        firstTab: expect.objectContaining({ type: 'codex' }),
      }),
    )
    const sessions = useAliceStore
      .getState()
      .sessions.filter((s) => s.agentId === 'demo-assistente')
    expect(sessions).toHaveLength(2)
    const current = useAliceStore
      .getState()
      .agents.find((a) => a.agentId === 'demo-assistente')!.currentSessionId!
    useAliceStore.getState().resumeSession('demo-assistente', current)
    expect(
      useProjectsStore.getState().projects[0].terminals.find((p) => p.id === sessions[1].paneId)
        ?.activeTabId,
    ).toBe(current)
    create.mockRestore()
  })
  it('reopens linked agents through existing plugin panes without PTY or changing session identity', () => {
    useAliceStore.getState().loadProfile('default')
    const state = useAliceStore.getState()
    state.connectAgent({
      accountLabel: 'ChatGPT',
      providerId: 'chatgpt-web',
      providerClass: 'web-conversation',
      displayName: 'GG',
      role: '',
      projectId: 'alice-demo',
      conversationUrl: 'https://example.com/synthetic/gg',
      canonicalIdentity: 'GG',
    })
    const agent = useAliceStore.getState().agents[0],
      session = useAliceStore.getState().sessions[0]
    const create = vi.spyOn(useProjectsStore.getState(), 'createPluginPane'),
      spawn = vi.spyOn(useProjectsStore.getState(), 'createAgentTerminal')
    useAliceStore.getState().openLinkedAgent(agent.agentId)
    useAliceStore.getState().openLinkedAgent(agent.agentId)
    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith('alice-demo', 'alice-agent-session', 'GG')
    expect(spawn).not.toHaveBeenCalled()
    expect(useProjectsStore.getState().projects[0].terminals.at(-1)?.kind).toBe(
      'alice-agent-session',
    )
    expect(useAliceStore.getState().sessions[0]).toMatchObject({
      sessionId: session.sessionId,
      surfaceUrl: session.surfaceUrl,
      agentId: agent.agentId,
    })
    useAliceStore.getState().renameAgent(agent.agentId, 'GG renamed')
    const pane = useAliceStore.getState().sessions[0].paneId!
    useAliceStore.getState().loadProfile('second')
    expect(useAliceStore.getState().agents).toEqual([])
    useAliceStore.getState().loadProfile('default')
    expect(useAliceStore.getState().agents[0]).toMatchObject({
      agentId: agent.agentId,
      displayName: 'GG renamed',
      canonicalIdentity: 'GG',
    })
    useAliceStore.getState().removeLinkedAgent(agent.agentId)
    expect(useAliceStore.getState().agents).toEqual([])
    expect(useProjectsStore.getState().projects[0].terminals.some((t) => t.id === pane)).toBe(false)
    create.mockRestore()
    spawn.mockRestore()
  })
})
