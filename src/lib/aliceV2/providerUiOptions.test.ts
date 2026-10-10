// @vitest-environment node
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  canChooseProviderMethod,
  CONNECTION_METHODS,
  defaultProviderSelection,
  exportProviderSettings,
  methodCapability,
  PROVIDER_IDS,
  type UiScope,
  updateProviderSelection,
  validateProviderSelection,
} from './providerUiOptions'

const scope: UiScope = {
  ownerId: 'demo_owner',
  profileId: 'profileA',
  projectId: 'projectA',
  configId: 'teamA',
  nodeId: 'GG',
}
describe('R264 UI-only provider and method matrix', () => {
  it.each(PROVIDER_IDS)('declares truthful non-executable choices for %s', (provider) => {
    for (const method of CONNECTION_METHODS) {
      const cap = methodCapability(provider, method),
        value = { ...defaultProviderSelection(scope), providerId: provider, method }
      if (canChooseProviderMethod(provider, method))
        expect(validateProviderSelection(value, scope)).toMatchObject({
          connected: false,
          executable: false,
        })
      else
        expect(() => validateProviderSelection(value, scope)).toThrow('UNAVAILABLE_PROVIDER_METHOD')
      if (!cap.selectable && canChooseProviderMethod(provider, method))
        expect(['account-login', 'api-key']).toContain(method)
    }
  })
  it('retains native pending, Claude blocker and unsupported account login', () => {
    expect(methodCapability('codex', 'local-cli').status).toBe('NATIVE_QA_PENDING')
    expect(methodCapability('claude', 'local-cli')).toMatchObject({
      selectable: false,
      status: 'UNAVAILABLE',
      reason: 'claudeBlocked',
    })
    expect(methodCapability('claude', 'api-key')).toMatchObject({
      selectable: true,
      status: 'REQUIRES_INTEGRATION',
    })
    expect(methodCapability('codex', 'account-login').selectable).toBe(false)
  })
  it.each(['ownerId', 'profileId', 'projectId', 'configId', 'nodeId'])(
    'rejects foreign %s',
    (key) => {
      expect(() =>
        validateProviderSelection(
          { ...defaultProviderSelection(scope), scope: { ...scope, [key]: 'other' } },
          scope,
        ),
      ).toThrow('FOREIGN_UI_SCOPE')
    },
  )
  it.each([
    'apiKey',
    'accessToken',
    'credentials',
    'password',
    'authRef',
    'connected',
    'executable',
    'permissions',
    'budget',
    'workspace',
    'model',
  ])('rejects extra or dangerous patch %s', (field) => {
    expect(() =>
      updateProviderSelection(defaultProviderSelection(scope), { [field]: 'dummy' }, scope),
    ).toThrow()
  })
  it.each(['connected', 'executable'])('never accepts %s true', (key) => {
    expect(() =>
      validateProviderSelection({ ...defaultProviderSelection(scope), [key]: true }, scope),
    ).toThrow('REAL_ACCESS_NOT_ALLOWED')
  })
  it('changing provider resets only that UI preference to simulation', () => {
    const local = updateProviderSelection(
      defaultProviderSelection(scope),
      { providerId: 'codex', method: 'local-cli' },
      scope,
    )
    expect(updateProviderSelection(local, { providerId: 'claude' }, scope).method).toBe('simulated')
    expect(local.providerId).toBe('codex')
  })
  it('exports sanitized preferences and refuses a mixed project set', () => {
    const selection = defaultProviderSelection(scope),
      other = defaultProviderSelection({ ...scope, nodeId: 'Dev' })
    const text = exportProviderSettings({ GG: selection, Dev: other })
    expect(text).not.toMatch(/authRef|token|password|credentials|Bearer/)
    expect(JSON.parse(text)).toMatchObject({ simulationOnly: true, executable: false })
    expect(() =>
      exportProviderSettings({
        GG: selection,
        Dev: defaultProviderSelection({ ...scope, nodeId: 'Dev', projectId: 'projectB' }),
      }),
    ).toThrow('FOREIGN_UI_SCOPE')
  })
  it('rejects unknown provider/method and secret-shaped scope IDs', () => {
    expect(() =>
      updateProviderSelection(defaultProviderSelection(scope), { providerId: 'unknown' }, scope),
    ).toThrow()
    expect(() =>
      updateProviderSelection(defaultProviderSelection(scope), { method: 'shell' }, scope),
    ).toThrow()
    expect(() => defaultProviderSelection({ ...scope, projectId: 'Bearer token' })).toThrow()
    expect(() => defaultProviderSelection({ ...scope, nodeId: '__proto__' })).toThrow(
      'INVALID_UI_SCOPE',
    )
  })
  it('has no auth/runtime/credential entrypoint', () => {
    const source = readFileSync('src/lib/aliceV2/providerUiOptions.ts', 'utf8')
    expect(source).not.toMatch(
      /fetch\s*\(|invoke\s*\(|spawn\s*\(|keyring|localStorage|process\.env|@tauri/,
    )
  })
  it('records unsupported account/API preference without advertising a connection', () => {
    const account = updateProviderSelection(
      defaultProviderSelection(scope),
      { providerId: 'claude', method: 'account-login' },
      scope,
    )
    expect(account).toMatchObject({ method: 'account-login', connected: false, executable: false })
    expect(methodCapability('claude', 'account-login')).toMatchObject({
      selectable: false,
      status: 'UNAVAILABLE',
    })
    const api = updateProviderSelection(
      account,
      { providerId: 'opencode', method: 'api-key' },
      scope,
    )
    expect(api).toMatchObject({ method: 'api-key', connected: false, executable: false })
    expect(methodCapability('opencode', 'api-key').status).toBe('UNAVAILABLE')
    expect(() => updateProviderSelection(account, { method: 'local-cli' }, scope)).toThrow(
      'UNAVAILABLE_PROVIDER_METHOD',
    )
    expect(() =>
      updateProviderSelection(defaultProviderSelection(scope), { method: 'account-login' }, scope),
    ).toThrow('UNAVAILABLE_PROVIDER_METHOD')
  })
})
