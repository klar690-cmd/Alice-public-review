import { describe, expect, it } from 'vitest'

import {
  accountCapabilities,
  createSimulationEvent,
  EMPTY_ALICE_STATE,
  safeConnectionUrl,
  validateAliceState,
} from './aliceModel'
import type { AliceAccount, AliceConnectionState } from './types'

const account: AliceAccount = {
  accountId: 'a',
  providerId: 'chatgpt-native',
  providerClass: 'native-surface',
  label: 'Account A',
  authMethod: 'native-ui',
  health: 'metadata-only',
}
function fixture(): AliceConnectionState {
  return {
    ...structuredClone(EMPTY_ALICE_STATE),
    accounts: [account],
    agents: ['GG', 'ARTE', 'ARTE_2'].map((name) => ({
      agentId: name,
      displayName: name,
      role: name,
      accountId: 'a',
      currentSessionId: null,
      projectId: null,
      status: 'native-only',
    })),
  }
}
describe('Alice identity and supported access boundaries', () => {
  it('one account owns distinct agents without assuming a session exists', () => {
    const s = validateAliceState(fixture())
    expect(s.accounts).toHaveLength(1)
    expect(s.agents).toHaveLength(3)
    expect(s.sessions).toHaveLength(0)
  })
  it('rejects orphan/duplicate identities and sessions belonging to another agent', () => {
    const s = fixture()
    s.agents[0].accountId = 'missing'
    expect(() => validateAliceState(s)).toThrow()
    const d = fixture()
    d.agents.push(d.agents[0])
    expect(() => validateAliceState(d)).toThrow()
    const b = fixture()
    b.sessions.push({
      sessionId: 'session',
      agentId: 'ARTE',
      label: 'native',
      kind: 'native-surface',
    })
    b.agents[0].currentSessionId = 'session'
    expect(() => validateAliceState(b)).toThrow()
  })
  it('never implies private conversation access from account metadata', () => {
    expect(accountCapabilities(account).privateConversationRead).toBe(false)
    expect(accountCapabilities(account).privateConversationWrite).toBe(false)
    expect(accountCapabilities(account).existingCliPty).toBe(false)
  })
  it('rejects credential-bearing URLs and raw secrets in config', () => {
    for (const url of [
      'javascript:alert(1)',
      'https://user:password@example.com',
      'https://example.com?token=secret',
      'https://example.com#access_token=x',
    ])
      expect(() => safeConnectionUrl(url)).toThrow()
    const raw = { ...fixture(), password: 'not-a-valid-config' }
    expect(() => validateAliceState(raw)).toThrow()
    const ref = fixture()
    ref.accounts[0] = {
      ...account,
      secretReference: { store: 'os-keychain', key: 'sk-not-a-reference' },
    }
    expect(() => validateAliceState(ref)).toThrow()
  })
  it('routing contract stays simulated and resolves real model bindings', () => {
    const event = createSimulationEvent(fixture(), 'GG')
    expect(event.mode).toBe('simulation')
    expect(event.accountId).toBe('a')
    expect(event.agentId).toBe('GG')
    expect(event.sessionId).toBeNull()
    expect(() => createSimulationEvent(fixture(), 'unknown')).toThrow()
  })
})
