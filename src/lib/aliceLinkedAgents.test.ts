import { beforeEach, describe, expect, it } from 'vitest'

import fixture from '../preview/canonical-r219.json'
import { createDemoConnections, createR219DemoConnections } from '../preview/data'
import { aliceCapabilities } from './aliceBinding'
import { createLiveEvent, parseRumoCanonical } from './aliceCanonical'
import { prepareAliceManualHandoff } from './aliceHandoff'
import {
  connectAliceAgent,
  originalConversation,
  removeLinkedAliceAgent,
  renameAliceAgent,
} from './aliceLinkedAgents'
import { EMPTY_ALICE_STATE, safeConversationUrl, validateAliceState } from './aliceModel'
import { aliceProfileKey, loadAliceProfile, saveAliceProfile } from './alicePersistence'
const files = fixture as Record<string, string>,
  main = files['main:'],
  fixed = files['assistente/source-art-active:'],
  taskId = 'PHASE_ASSISTENTE_R219_ALICE_WEB_AGENT_CANONICAL_HANDOFF_V1'
const control = files[main + ':docs/coordination/CONTROL.md'],
  agentDoc = files[fixed + ':docs/coordination/ASSISTENTE.md'],
  task = files[fixed + ':docs/coordination/' + taskId + '.md']
const snapshot = () =>
  parseRumoCanonical(control, agentDoc, task, {
    mainSha: main,
    fixedSha: fixed,
    fixture: false,
    readAt: Date.now(),
  })
const input = {
  accountLabel: 'Local account',
  providerId: 'chatgpt-web',
  providerClass: 'web-conversation' as const,
  displayName: 'GG',
  role: 'Governance',
  projectId: 'project',
  conversationUrl: 'https://example.com/c/gg?view=all#reply',
  canonicalIdentity: 'GG',
}
describe('R219 linked identities and private profile metadata', () => {
  beforeEach(() => localStorage.clear())
  it('creates GG/SOL sharing one account, duplicate aliases retain independent IDs', () => {
    let state = connectAliceAgent(structuredClone(EMPTY_ALICE_STATE), input)
    state = connectAliceAgent(state, {
      ...input,
      accountId: state.accounts[0].accountId,
      displayName: 'SOL',
      conversationUrl: 'https://example.com/c/sol',
      canonicalIdentity: 'SOL',
    })
    state = connectAliceAgent(state, { ...input, accountId: state.accounts[0].accountId })
    expect(state.accounts).toHaveLength(1)
    expect(state.agents).toHaveLength(3)
    expect(new Set(state.agents.map((a) => a.agentId)).size).toBe(3)
    expect(originalConversation(state, state.agents[0].agentId)).toBe(input.conversationUrl)
    expect(originalConversation(state, state.agents[1].agentId)).toBe('https://example.com/c/sol')
  })
  it('renames COSMO and back without changing provider, IDs, session/task refs or canonical role', () => {
    const original = createR219DemoConnections(),
      cosmo = original.agents.find((a) => a.canonicalIdentity === 'COSMO')!
    cosmo.canonicalTaskUrl =
      'https://github.com/klar690-cmd/RumoAoMilhao/blob/main/docs/coordination/PHASE_COSMO_EXAMPLE.md'
    const renamed = renameAliceAgent(original, cosmo.agentId, ' Aurora '),
      changed = renamed.agents.find((a) => a.agentId === cosmo.agentId)!
    expect(changed).toEqual({ ...cosmo, displayName: 'Aurora' })
    expect(renamed.sessions).toBe(original.sessions)
    expect(renamed.accounts).toBe(original.accounts)
    expect(
      renameAliceAgent(renamed, cosmo.agentId, 'COSMO').agents.find(
        (a) => a.agentId === cosmo.agentId,
      ),
    ).toEqual(cosmo)
  })
  it.each(['', '  ', 'a'.repeat(81), 'name' + String.fromCharCode(0)])(
    'rejects invalid aliases without partial records',
    (name) => {
      const state = structuredClone(EMPTY_ALICE_STATE)
      expect(() => connectAliceAgent(state, { ...input, displayName: name })).toThrow()
      expect(state.agents).toEqual([])
      expect(state.accounts).toEqual([])
    },
  )
  it.each([
    'javascript:alert(1)',
    'file:///private',
    'data:text/html,x',
    'https://user:password@example.com/c/gg',
    'not-a-url',
    'https://example.com/c/gg?access_token=secret',
  ])('rejects unsafe/private credential URLs', (url) =>
    expect(() => safeConversationUrl(url)).toThrow(),
  )
  it('normalizes safe http/https conversation navigation links', () => {
    expect(safeConversationUrl('http://example.com/c/1')).toBe('http://example.com/c/1')
    expect(safeConversationUrl(input.conversationUrl)).toBe(input.conversationUrl)
  })
  it('restores private links and rename in its profile only; event/handoff never carries the URL', () => {
    const state = connectAliceAgent(structuredClone(EMPTY_ALICE_STATE), input),
      id = state.agents[0].agentId
    expect(saveAliceProfile(localStorage, 'one', renameAliceAgent(state, id, 'GG editado'))).toBe(
      true,
    )
    expect(loadAliceProfile(localStorage, 'two').agents).toEqual([])
    const restored = loadAliceProfile(localStorage, 'one')
    expect(restored.agents[0].displayName).toBe('GG editado')
    expect(originalConversation(restored, id)).toBe(input.conversationUrl)
    expect(
      JSON.stringify(createLiveEvent(restored, id, 'project', 'connection.test')),
    ).not.toContain('example.com')
    const current = snapshot(),
      request = prepareAliceManualHandoff(restored, id, 'project', current, current)
    expect(request.execution_authorized).toBe(false)
    expect(request.manual_relay_required).toBe(true)
    expect(JSON.stringify(request)).not.toContain('example.com')
    expect(JSON.stringify(request)).not.toContain('GG editado')
  })
  it('loads R216 metadata unchanged and migrates Antigravity CLI record only to linked desktop category', () => {
    const legacy = createDemoConnections()
    legacy.accounts.push({
      accountId: 'old-agy',
      providerId: 'antigravity',
      providerClass: 'cli-pty',
      label: 'Antigravity',
      authMethod: 'none',
      health: 'metadata-only',
    })
    localStorage.setItem(aliceProfileKey('one'), JSON.stringify(legacy))
    const restored = loadAliceProfile(localStorage, 'one')
    expect(restored.accounts[0].providerId).toBe('codex')
    expect(restored.accounts.at(-1)?.providerClass).toBe('external-desktop-surface')
    expect(restored.agents[0].currentSessionId).toBe(legacy.agents[0].currentSessionId)
  })
  it('removes only local linked agent/session and leaves siblings/account/original data intact', () => {
    const state = createR219DemoConnections(),
      id = state.agents.find((a) => a.canonicalIdentity === 'SOL')!.agentId,
      next = removeLinkedAliceAgent(state, id)
    expect(next.agents).toHaveLength(state.agents.length - 1)
    expect(next.accounts).toBe(state.accounts)
    expect(next.sessions.some((s) => s.agentId === id)).toBe(false)
    expect(state.agents.some((a) => a.agentId === id)).toBe(true)
  })
  it('web and external desktop have no direct programmable control even in native runtime', () => {
    const state = createR219DemoConnections()
    for (const identity of ['GG', 'COSMO']) {
      const agent = state.agents.find((a) => a.canonicalIdentity === identity)!,
        account = state.accounts.find((a) => a.accountId === agent.accountId)!,
        session = state.sessions.find((s) => s.sessionId === agent.currentSessionId)
      const caps = aliceCapabilities(account, true, session)
      expect(caps).toMatchObject({
        createSession: false,
        resumeSession: false,
        sendInput: false,
        streamOutput: false,
        readHistory: false,
        ptyAttach: false,
        filesWorkspace: false,
        stopRestart: false,
        mcpSkills: false,
        usageTelemetry: false,
      })
      expect(caps.openOriginal).toBe(identity === 'GG')
    }
  })
  it('validates R220 exact task, revision/session/generation/base and rejects every drift', () => {
    expect(snapshot()).toMatchObject({
      taskId,
      taskRevision: 2,
      generation: 61,
      coordinationRevision: 'COORD-2026-10-07-R220',
    })
    for (const key of [
      'TASK_REVISION',
      'SESSION_ID',
      'AUTHORIZATION_GENERATION',
      'COORDINATION_REVISION',
      'EXECUTION_BRANCH',
      'BASE_CANDIDATE_SHA',
    ]) {
      const changed = task.replace(
        new RegExp('^' + key + ':.*$', 'm'),
        key + ': ' + String.fromCharCode(96) + 'mismatch' + String.fromCharCode(96),
      )
      expect(() =>
        parseRumoCanonical(control, agentDoc, changed, {
          mainSha: main,
          fixedSha: fixed,
          fixture: false,
          readAt: Date.now(),
        }),
      ).toThrow()
    }
    expect(() =>
      parseRumoCanonical(
        control.replace('COORD-2026-10-07-R220', 'COORD-2026-10-07-R221'),
        agentDoc,
        task,
        { mainSha: main, fixedSha: fixed, fixture: false, readAt: Date.now() },
      ),
    ).toThrow()
  })
  it('handoff blocks fixture, stale, missing role, altered task and incompatible project', () => {
    const state = connectAliceAgent(structuredClone(EMPTY_ALICE_STATE), input),
      id = state.agents[0].agentId,
      current = snapshot()
    for (const changed of [
      { ...current, fixture: true },
      { ...current, readAt: 0 },
      { ...current, generation: 62 },
    ])
      expect(() => prepareAliceManualHandoff(state, id, 'project', changed, current)).toThrow()
    expect(() => prepareAliceManualHandoff(state, id, 'other', current, current)).toThrow()
    const missing = {
      ...state,
      agents: state.agents.map((a) => ({ ...a, canonicalIdentity: undefined })),
    }
    expect(() => prepareAliceManualHandoff(missing, id, 'project', current, current)).toThrow()
  })
  it('presentation labels never confer canonical execution identity', () => {
    const state = createR219DemoConnections(),
      current = snapshot()
    state.agents[0].displayName = 'Custom alias'
    expect(
      createLiveEvent(state, 'demo-assistente', 'alice-demo', 'canonical.dispatch.requested', {
        snapshot: current,
        expected: current,
      }).canonical_task?.identity,
    ).toBe('ASSISTENTE/WORK')
    state.agents[0].canonicalIdentity = 'COSMO'
    state.agents[0].displayName = 'ASSISTENTE/WORK'
    expect(() =>
      createLiveEvent(state, 'demo-assistente', 'alice-demo', 'canonical.dispatch.requested', {
        snapshot: current,
        expected: current,
      }),
    ).toThrow()
  })
  it('corrupt/missing linked metadata cannot escape the profile', () => {
    localStorage.setItem(aliceProfileKey('one'), '{bad')
    expect(loadAliceProfile(localStorage, 'one').agents).toEqual([])
    const state = createR219DemoConnections()
    state.sessions.find((s) => s.kind === 'web-conversation')!.surfaceUrl = 'javascript:x'
    expect(() => validateAliceState(state)).toThrow()
  })
})
