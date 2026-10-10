import { describe, expect, it } from 'vitest'

import { createDemoConnections, createDemoWorkspace } from '../preview/data'
import { agentProviderContributions } from './agentProviders'
import {
  aliceCapabilities,
  bindAliceTab,
  cliBindingSupported,
  reconcileAliceSessions,
} from './aliceBinding'

describe('Alice uses real Alethe project/pane/sub-tab identities', () => {
  it('tracks provider conversation and PTY handles without a parallel terminal', () => {
    const state = createDemoConnections(),
      project = createDemoWorkspace().projects[0],
      pane = project.terminals[3],
      tab = pane.tabs[0]
    tab.ptyId = 'existing-pty'
    tab.sessionId = 'existing-conversation'
    const session = bindAliceTab(state, 'demo-assistente', project, pane.id, tab.id)
    expect(session).toMatchObject({
      sessionId: tab.id,
      tabId: tab.id,
      paneId: pane.id,
      projectId: project.id,
      ptyId: 'existing-pty',
      providerHandle: 'existing-conversation',
      health: 'bound',
    })
    expect(aliceCapabilities(state.accounts[0], true, session).sendInput).toBe(true)
    expect(aliceCapabilities(state.accounts[0], false, session).sendInput).toBe(false)
  })
  it('rejects provider mismatch, plugin pane, missing and double-owned tabs', () => {
    const state = createDemoConnections(),
      project = createDemoWorkspace().projects[0]
    expect(() =>
      bindAliceTab(state, 'demo-agent-0', project, 'pane-pty', 'demo-pty-disabled'),
    ).toThrow()
    expect(() =>
      bindAliceTab(state, 'demo-assistente', project, 'pane-0', 'demo-session-0-native'),
    ).toThrow()
    expect(() => bindAliceTab(state, 'demo-assistente', project, 'missing', 'missing')).toThrow()
    state.agents.push({ ...state.agents[0], agentId: 'other' })
    expect(() => bindAliceTab(state, 'other', project, 'pane-pty', 'demo-pty-disabled')).toThrow()
  })
  it('marks removed/replaced tabs disconnected and reconciles recovered handle', () => {
    const state = createDemoConnections(),
      project = createDemoWorkspace().projects[0]
    const disconnected = reconcileAliceSessions(state.sessions, [])[0]
    expect(disconnected.health).toBe('disconnected')
    project.terminals[3].tabs[0].ptyId = 'reattached'
    expect(reconcileAliceSessions(state.sessions, [project])[0].ptyId).toBe('reattached')
    project.terminals[3].tabs[0].type = 'claude'
    expect(reconcileAliceSessions(state.sessions, [project])[0].health).toBe('disconnected')
  })
  it('generic registered CLI works; unknown/Antigravity/closed surfaces remain disabled', () => {
    const account = createDemoConnections().accounts[0]
    const handle = agentProviderContributions.add('alice-test', {
      id: 'generic-test',
      label: 'Generic',
      cliCommand: 'safe-cli',
    })
    expect(cliBindingSupported({ ...account, providerId: 'generic-test' })).toBe(true)
    handle.dispose()
    expect(cliBindingSupported({ ...account, providerId: 'generic-test' })).toBe(false)
    expect(cliBindingSupported({ ...account, providerId: 'antigravity' })).toBe(false)
    const closed = aliceCapabilities(createDemoConnections().accounts[1], true)
    for (const key of [
      'createSession',
      'resumeSession',
      'sendInput',
      'streamOutput',
      'readHistory',
      'ptyAttach',
      'filesWorkspace',
      'stopRestart',
      'mcpSkills',
      'usageTelemetry',
    ] as const)
      expect(closed[key]).toBe(false)
    expect(closed.openOriginal).toBe(true)
  })
})
