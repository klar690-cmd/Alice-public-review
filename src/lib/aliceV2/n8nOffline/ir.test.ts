// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { OFFLINE } from '../offlineAdapters/contracts'
import { demoGraph } from '../offlineCoordinator/fixtures'
import {
  compileOfflineIR,
  initialCallbackLedger,
  serializeOfflineIR,
  validateCallbackFixture,
  validateOfflineIR,
} from './ir'

function callback() {
  return {
    marker: OFFLINE,
    format: 'alice.n8n.callback-fixture.v1',
    scope: {
      projectId: 'projectA',
      graphRevision: 1,
      nodeId: 'gg',
      runId: 'run1',
      attemptId: 'gg_attempt1',
      provider: 'codex',
      mode: 'local-app-server',
    },
    sequence: 1,
    event: 'mock.completed',
    proof: 'NONE_OFFLINE_UNTRUSTED',
  }
}
describe('C nondeployable n8n IR', () => {
  it('round-trips deterministically without an authenticated workflow', () => {
    const ir = compileOfflineIR(demoGraph()),
      serialized = serializeOfflineIR(ir)
    expect(serializeOfflineIR(JSON.parse(serialized))).toBe(serialized)
    expect(ir).toMatchObject({
      deployable: false,
      connectionState: 'not-connected',
      executed: false,
      simulationOnly: true,
      executable: false,
    })
    expect(ir.nodes[2].runtimeState).toBe('UNAVAILABLE_BLOCKED_UNSUPPORTED')
    expect(serialized).not.toMatch(
      /authref:|authRef|sessionRef|nonce|https:|credentials|webhook|\$env/,
    )
  })
  it.each(['deployable', 'executed', 'executable'])('rejects promotion of %s', (field) => {
    const ir = structuredClone(compileOfflineIR(demoGraph()))
    Object.assign(ir, { [field]: true })
    expect(() => validateOfflineIR(ir)).toThrow('IR_SCOPE_OR_CONTRACT_MISMATCH')
  })
  it.each(['authRef', 'apiKey', 'hostUrl', 'credentials', 'command', 'signature', 'sessionRef'])(
    'rejects injected %s',
    (field) => {
      const ir = structuredClone(compileOfflineIR(demoGraph()))
      Object.assign(ir, { [field]: 'dummy' })
      expect(() => validateOfflineIR(ir)).toThrow()
    },
  )
  it.each(['https://host/path', '{{ $env.KEY }}', '../escape', 'C:/Private'])(
    'rejects template/path/host injection %s',
    (id) => {
      const g = structuredClone(demoGraph())
      Object.assign(g.nodes[1], { id })
      expect(() => compileOfflineIR(g)).toThrow()
    },
  )
  it('rejects cross-project nodes and edges', () => {
    const ir = compileOfflineIR(demoGraph()),
      node = structuredClone(ir),
      edge = structuredClone(ir)
    node.nodes[1].projectId = 'projectB'
    edge.edges[0].projectId = 'projectB'
    expect(() => validateOfflineIR(node)).toThrow('IR_SCOPE_OR_CONTRACT_MISMATCH')
    expect(() => validateOfflineIR(edge)).toThrow('IR_SCOPE_OR_CONTRACT_MISMATCH')
  })
  it('rejects unsupported methods, provider and active broker callback claims', () => {
    const ir = structuredClone(compileOfflineIR(demoGraph()))
    ir.nodes[0].method = 'real-sdk'
    expect(() => validateOfflineIR(ir)).toThrow()
    const active = structuredClone(compileOfflineIR(demoGraph()))
    Object.assign(active.callbackContract, { implemented: true })
    expect(() => validateOfflineIR(active)).toThrow()
  })
  it('requires a known sufficient reserved budget', () => {
    expect(() => compileOfflineIR({ ...demoGraph(), budgetUnits: null })).toThrow('UNKNOWN_BUDGET')
    expect(() => compileOfflineIR({ ...demoGraph(), budgetUnits: 1 })).toThrow(
      'BUDGET_NOT_RESERVED',
    )
  })
  it('offline callbacks reject replay, disorder, foreign scope and spoofed signatures', () => {
    const ir = compileOfflineIR(demoGraph()),
      cb = callback(),
      ledger = initialCallbackLedger(ir),
      next = validateCallbackFixture(ir, cb, ledger)
    expect(next.executable).toBe(false)
    expect(() => validateCallbackFixture(ir, cb, next.nextLedger)).toThrow(
      'CALLBACK_REPLAY_OR_ORDER',
    )
    expect(() => validateCallbackFixture(ir, { ...cb, sequence: 2 }, ledger)).toThrow(
      'CALLBACK_REPLAY_OR_ORDER',
    )
    expect(() =>
      validateCallbackFixture(ir, { ...cb, scope: { ...cb.scope, projectId: 'projectB' } }, ledger),
    ).toThrow('FOREIGN_CALLBACK_SCOPE')
    expect(() =>
      validateCallbackFixture(ir, { ...cb, signed: true, signature: 'spoof' }, ledger),
    ).toThrow()
    expect(() =>
      validateCallbackFixture(ir, { ...cb, proof: 'signed-production' }, ledger),
    ).toThrow('NOT_AN_OFFLINE_CALLBACK')
  })
  it('does not accept a foreign or duplicate ledger', () => {
    const ir = compileOfflineIR(demoGraph()),
      ledger = initialCallbackLedger(ir)
    expect(() =>
      validateCallbackFixture(ir, callback(), { ...ledger, projectId: 'projectB' }),
    ).toThrow('FOREIGN_CALLBACK_LEDGER')
    expect(() =>
      validateCallbackFixture(ir, callback(), {
        ...ledger,
        cursors: [ledger.cursors[0], ledger.cursors[0], ledger.cursors[2]],
      }),
    ).toThrow('DUPLICATE_CALLBACK_LEDGER')
  })
})
