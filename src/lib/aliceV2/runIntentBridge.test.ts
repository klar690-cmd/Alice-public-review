import { describe, expect, it, vi } from 'vitest'

import { activeTeam, createAliceV2UiStore, selectAgentRunIntent } from '../../stores/aliceV2UiStore'
import { CONNECTION_METHODS, defaultProviderSelection, PROVIDER_IDS } from './providerUiOptions'
import {
  inspectRunRequirements,
  type IntentContext,
  type IntentRequest,
  prepareAgentRunIntent,
} from './runIntentBridge'

const scope = {
  ownerId: 'ownerA',
  profileId: 'profileA',
  projectId: 'projectA',
  configId: 'teamA',
  nodeId: 'GG',
}
const config = {
  ...defaultProviderSelection(scope),
  providerId: 'codex',
  method: 'local-cli',
} as const
const context: IntentContext = {
  scope,
  role: 'manager',
  graphSchemaVersion: 1,
  graphRevision: 2,
  previousSequence: 3,
  spentIntentIds: ['old_intent'],
}
const request: IntentRequest = {
  schemaVersion: 1,
  scope,
  graphSchemaVersion: 1,
  graphRevision: 2,
  intentId: 'intent4',
  sequence: 4,
}
const guards = {
  executable: false,
  connectionVerified: false,
  nativeQAGate: 'BLOCKED_OR_NOT_VERIFIED',
  requiresExplicitUserApproval: true,
  providerCallAuthorization: 'NONE',
  n8nDeployable: false,
  decision: 'DENY',
}
const prepare = (value: unknown = config, c: unknown = context, r: unknown = request) =>
  prepareAgentRunIntent(value, c, r)
function denied(result: ReturnType<typeof prepare>, code: string) {
  expect(result).toMatchObject({ ...guards, preparation: 'REJECTED', intent: null })
  expect(result.denialReasons[0]).toBe(code)
}
describe('M3e UI preference to intent trust seam', () => {
  it('prepares immutable, versioned metadata while keeping all actual gates denied', () => {
    const result = prepare()
    expect(result).toMatchObject({
      ...guards,
      preparation: 'PREPARED_OFFLINE_NOT_EXECUTABLE',
      mode: 'PREPARATION_ONLY',
      intent: {
        scope,
        role: 'manager',
        graphRevision: 2,
        providerId: 'codex',
        method: 'local-cli',
      },
    })
    expect(result.gate).toBe('BLOCKED_NATIVE_QA')
    expect(result.denialReasons).toEqual([
      'NATIVE_QA_NOT_VERIFIED',
      'INTEGRATION_NOT_IMPLEMENTED',
      'PROVIDER_NOT_CONNECTED',
      'TRUSTED_PROJECT_GRANT_MISSING',
      'EXPLICIT_USER_APPROVAL_REQUIRED',
      'NO_REAL_PERMISSIONS',
      'NO_PAID_USAGE_AUTHORIZED',
      'N8N_NOT_CONNECTED',
    ])
    expect(Object.isFrozen(result.intent?.scope)).toBe(true)
    expect(Object.isFrozen(result.denialReasons)).toBe(true)
  })
  it.each(['manager', 'worker', 'reviewer'] as const)(
    'preserves the independent %s role without interpreting role text as authority',
    (role) => {
      const result = prepare(config, { ...context, role })
      expect(result.intent?.role).toBe(role)
      expect(result).toMatchObject(guards)
    },
  )
  it.each(['ownerId', 'profileId', 'projectId', 'configId', 'nodeId'] as const)(
    'rejects foreign %s in preferences and intent requests without leaking either scope',
    (key) => {
      const foreign = { ...scope, [key]: 'foreign_value' }
      for (const result of [
        prepare({ ...config, scope: foreign }),
        prepare(config, context, { ...request, scope: foreign }),
      ]) {
        denied(result, 'FOREIGN_UI_SCOPE')
        expect(JSON.stringify(result)).not.toContain('foreign_value')
        expect(JSON.stringify(result)).not.toContain('projectA')
      }
    },
  )
  it.each([1, 3])('rejects stale or future graph revision %i', (graphRevision) =>
    denied(prepare(config, context, { ...request, graphRevision }), 'STALE_GRAPH_REVISION'),
  )
  it.each([0, 1, 3])('rejects invalid or replayed sequence %i', (sequence) =>
    denied(
      prepare(config, context, { ...request, sequence }),
      sequence === 0 ? 'MALFORMED' : 'REPLAYED_INTENT',
    ),
  )
  it('rejects a spent intent id even with a newer sequence; does not consume caller ledger', () => {
    denied(
      prepare(config, context, { ...request, intentId: 'old_intent', sequence: 99 }),
      'REPLAYED_INTENT',
    )
    expect(context.spentIntentIds).toEqual(['old_intent'])
    expect(prepare()).toEqual(prepare())
  })
  it.each(['simulated', 'local-cli', 'api-key', 'managed-cloud'] as const)(
    'keeps same provider with %s mode distinct without connection claims',
    (method) => {
      const result = prepare({ ...config, method })
      expect(result.intent?.method).toBe(method)
      expect(result).toMatchObject(guards)
      expect(result.gate).toBe(
        method === 'simulated'
          ? 'SIMULATION_ONLY'
          : method === 'local-cli'
            ? 'BLOCKED_NATIVE_QA'
            : 'NOT_CONNECTED',
      )
    },
  )
  it.each([
    { providerId: 'claude', method: 'local-cli', code: 'CLAUDE_STRUCTURED_BLOCKED' },
    { providerId: 'codex', method: 'account-login', code: 'ACCOUNT_METHOD_UNAVAILABLE' },
    { providerId: 'fake', method: 'managed-cloud', code: 'METHOD_UNAVAILABLE' },
    { providerId: 'opencode', method: 'managed-cloud', code: 'METHOD_UNAVAILABLE' },
    { providerId: 'claude', method: 'subscription-cloud', code: 'INVALID_PROVIDER_SELECTION' },
  ])('denies unsupported $providerId/$method', ({ providerId, method, code }) =>
    denied(prepare({ ...config, providerId, method }), code),
  )
  it('Claude programmable metadata remains blocked, with no subscription promise', () => {
    const result = prepare({ ...config, providerId: 'claude', method: 'managed-cloud' })
    expect(result.intent?.providerId).toBe('claude')
    expect(result.denialReasons[0]).toBe('CLAUDE_STRUCTURED_BLOCKED')
    expect(result).toMatchObject(guards)
  })
  it.each(['<script>launch()</script>', 'codex; spawn', 'Bearer dummy_fixture', 'unknown'])(
    'rejects a label or injection-like provider without echoing it',
    (providerId) => {
      const result = prepare({ ...config, providerId })
      expect(result.preparation).toBe('REJECTED')
      expect(JSON.stringify(result)).not.toContain(providerId)
      expect(result).toMatchObject(guards)
    },
  )
  it.each(['apiKey', 'token', 'credentials', 'secret', 'sessionCookie', 'password'])(
    'rejects secret-like %s fields without publishing the supplied value',
    (key) => {
      const marker = 'PRIVATE_TEST_MARKER'
      for (const result of [
        prepare({ ...config, [key]: marker }),
        prepare(config, { ...context, [key]: marker }),
        prepare(config, context, { ...request, [key]: marker }),
      ]) {
        denied(result, 'SECRET_MATERIAL')
        expect(JSON.stringify(result)).not.toContain(marker)
      }
    },
  )
  it.each([
    { permissions: 'workspace-write' },
    { budget: 'unlimited' },
    { budget: -1 },
    { connected: true },
    { executable: true },
    { workspace: 'C:/private' },
    { model: 'paid-model' },
  ])('rejects access escalation %j', (patch) =>
    denied(prepare({ ...config, ...patch }), 'REAL_ACCESS_NOT_ALLOWED'),
  )
  it.each([
    { role: 'administrator' },
    { graphSchemaVersion: 2 },
    { graphRevision: 0 },
    { previousSequence: -1 },
    { previousSequence: Infinity },
    { spentIntentIds: ['../escape'] },
  ])('rejects malformed caller context %j', (patch) =>
    denied(prepare(config, { ...context, ...patch }), 'INVALID_CONTEXT'),
  )
  it.each([null, {}, [], true, () => {}, new Date()])(
    'returns typed denial for malformed data %j',
    (value) => {
      expect(() => prepare(value)).not.toThrow()
      expect(prepare(value)).toMatchObject({ ...guards, preparation: 'REJECTED', intent: null })
    },
  )
  it('never invokes getters or serializes thrown errors, prototypes or cycles', () => {
    const getter = vi.fn(() => {
      throw new Error('PRIVATE_TEST_MARKER')
    })
    const accessor = Object.defineProperty({}, 'providerId', { get: getter, enumerable: true })
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    for (const value of [accessor, cycle, Object.create(config)]) {
      denied(prepare(value), 'MALFORMED')
      expect(JSON.stringify(prepare(value))).not.toContain('PRIVATE_TEST_MARKER')
    }
    expect(getter).not.toHaveBeenCalled()
  })
  it('bounds the ledger and rejects spoofed caller authority', () => {
    denied(prepare(config, { ...context, spentIntentIds: Array(129).fill('spent') }), 'MALFORMED')
    denied(prepare(config, { ...context, nativeQA: 'PASS', approved: true }), 'MALFORMED')
    denied(prepare({ ...config, grant: { approved: true } }), 'MALFORMED')
  })
  it('all provider/method combinations produce frozen non-executable requirements', () => {
    for (const providerId of PROVIDER_IDS)
      for (const method of CONNECTION_METHODS) {
        const r = inspectRunRequirements({ ...config, providerId, method })
        expect(r).toMatchObject(guards)
        expect(r.denialReasons.length).toBeGreaterThan(0)
        expect(Object.isFrozen(r)).toBe(true)
      }
  })
})
describe('existing store read-only projection', () => {
  it('R271 editable blocked account/API choices cannot cross the immutable intent gate', () => {
    const store = createAliceV2UiStore('profileA', undefined, 'projectA')
    for (const [providerId, method, code] of [
      ['claude', 'account-login', 'ACCOUNT_METHOD_UNAVAILABLE'],
      ['opencode', 'api-key', 'METHOD_UNAVAILABLE'],
    ] as const) {
      store.getState().updateProvider('GG', { providerId, method })
      const selection = activeTeam(store.getState()).providerSettings.GG
      expect(selection).toMatchObject({ providerId, method, connected: false, executable: false })
      denied(
        selectAgentRunIntent(
          store.getState(),
          'GG',
          {
            ...request,
            scope: selection.scope,
            graphRevision: activeTeam(store.getState()).graph.revision,
          },
          3,
          [],
        ),
        code,
      )
    }
  })
  function intentFor(
    store: ReturnType<typeof createAliceV2UiStore>,
    nodeId: string,
    revision = activeTeam(store.getState()).graph.revision,
  ) {
    const selection = activeTeam(store.getState()).providerSettings[nodeId]
    return selectAgentRunIntent(
      store.getState(),
      nodeId,
      { ...request, scope: selection?.scope, graphRevision: revision },
      3,
      [],
    )
  }
  it('derives real team/node identity and roles independently without changing store or fake graph', () => {
    const store = createAliceV2UiStore('profileA', undefined, 'projectA')
    store.getState().updateProvider('GG', { providerId: 'codex', method: 'local-cli' })
    store.getState().updateProvider('Dev', { providerId: 'claude', method: 'api-key' })
    const before = store.getState(),
      subscriber = vi.fn()
    store.subscribe(subscriber)
    const gg = intentFor(store, 'GG'),
      worker = intentFor(store, 'Dev')
    expect(gg.intent).toMatchObject({
      role: 'manager',
      providerId: 'codex',
      scope: { nodeId: 'GG', projectId: 'projectA' },
    })
    expect(worker.intent).toMatchObject({
      role: 'worker',
      providerId: 'claude',
      scope: { nodeId: 'Dev' },
    })
    expect(intentFor(store, 'Auditor').intent?.role).toBe('reviewer')
    expect(store.getState()).toBe(before)
    expect(subscriber).not.toHaveBeenCalled()
    expect(
      before.teams[0].graph.nodes.every(
        (n) => n.provider === 'fake' && n.capability === 'fake.message',
      ),
    ).toBe(true)
  })
  it('checks graph freshness after existing editor mutation and keeps duplicate/clone identity scoped', () => {
    const store = createAliceV2UiStore()
    const old = activeTeam(store.getState()).graph.revision
    store.getState().updateNode('GG', { role: 'custom free text' })
    denied(intentFor(store, 'GG', old), 'STALE_GRAPH_REVISION')
    store.getState().duplicateNode()
    const id = store.getState().selectedNode!
    expect(intentFor(store, id).intent?.scope.nodeId).toBe(id)
    store.getState().cloneTeam()
    expect(intentFor(store, 'GG').intent?.scope.configId).toBe(store.getState().activeId)
  })
  it('rejects foreign sidecar, mismatched request and unknown node without altering existing stores', () => {
    const a = createAliceV2UiStore('profileA', undefined, 'projectA'),
      b = createAliceV2UiStore('profileB', undefined, 'projectB')
    const state = a.getState(),
      team = activeTeam(state),
      foreign = activeTeam(b.getState()).providerSettings.GG
    const tampered = {
      ...state,
      teams: [{ ...team, providerSettings: { ...team.providerSettings, GG: foreign } }],
    }
    const r = {
      ...request,
      scope: team.providerSettings.GG.scope,
      graphRevision: team.graph.revision,
    }
    denied(selectAgentRunIntent(tampered, 'GG', r, 3, []), 'FOREIGN_UI_SCOPE')
    denied(selectAgentRunIntent(b.getState(), 'GG', r, 3, []), 'FOREIGN_UI_SCOPE')
    denied(selectAgentRunIntent(state, 'missing', r, 3, []), 'MALFORMED')
    expect(a.getState()).toBe(state)
  })
})
