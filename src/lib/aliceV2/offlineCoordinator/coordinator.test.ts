// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { frame } from '../offlineAdapters/fixtures'
import { evaluateOfflineGrant } from '../securityPolicy'
import { OfflineCoordinator } from './coordinator'
import { authorization, demoGraph, demoRun, finishFixture } from './fixtures'

describe('B deterministic offline coordination', () => {
  it('enforces a narrower run grant even when the node permits more tools', () => {
    const graph = demoGraph(),
      c = new OfflineCoordinator({
        ...graph,
        nodes: graph.nodes.map((n) => (n.id === 'codex' ? { ...n, needsApproval: false } : n)),
      })
    c.start('gg', 'gg', authorization(c, 'gg', 'ngg'))
    finishFixture(c, 'gg')
    const auth = structuredClone(authorization(c, 'codex', 'narrow'))
    Object.assign(auth.grant!, { tools: ['read'] })
    Object.assign(auth.request, { tools: ['read'] })
    c.start('codex', 'codex', auth)
    const before = c.snapshot()
    expect(() =>
      c.ingest(
        'codex',
        frame(c.scope('codex'), 3, 'tool/request', { approvalId: 'writeask', tool: 'write' }),
      ),
    ).toThrow('NON_DELEGABLE_TOOL')
    expect(c.snapshot()).toEqual(before)
  })
  it('rejects a grant broader than the node tool allowlist', () => {
    const c = new OfflineCoordinator(demoGraph()),
      auth = structuredClone(authorization(c, 'gg', 'broad'))
    Object.assign(auth.grant!, { tools: ['read', 'write'] })
    expect(() => c.start('gg', 'broad', auth)).toThrow('FIXTURE_GRANT_SCOPE')
    expect(c.snapshot().trace).toHaveLength(0)
  })
  it('retry recovers only its own dependency branch', () => {
    const graph = demoGraph(),
      template = graph.nodes[2]
    const c = new OfflineCoordinator({
      ...graph,
      budgetUnits: 25,
      nodes: [
        ...graph.nodes,
        { ...template, id: 'other', provider: 'codex', dependsOn: ['gg'] },
        { ...template, id: 'otherChild', dependsOn: ['other'] },
      ],
    })
    c.start('gg', 'gg', authorization(c, 'gg', 'ngg'))
    finishFixture(c, 'gg')
    c.start('other', 'other', authorization(c, 'other', 'nother'))
    c.ingest('other', frame(c.scope('other'), 3, 'turn/failed', { text: 'Other branch failed' }))
    c.start('codex', 'codex', authorization(c, 'codex', 'ncodex'))
    c.approve(
      'codex',
      'deny',
      'deny',
      'human-fixture',
      authorization(c, 'codex', 'ndenied', 'resume'),
    )
    c.retry('codex', 'retry', authorization(c, 'codex', 'nretry', 'start', 2))
    expect(c.snapshot().nodes.find((n) => n.nodeId === 'otherChild')!.status).toBe('cancelled')
    expect(c.snapshot().nodes.find((n) => n.nodeId === 'claude')!.status).toBe('queued')
  })
  it('runs GG to Codex to Claude with two exactly-once handoffs', () => {
    const result = demoRun()
    expect(result).toEqual(demoRun())
    expect(result.status).toBe('completed')
    expect(result.spentUnits).toBe(3)
    expect(result.availableUnits).toBe(12)
    expect(result.trace.filter((e) => e.kind === 'handoff').map((e) => e.detail)).toEqual([
      'codex',
      'claude',
    ])
    expect(result.nodes[2].fixtureStatus).toBe('RUNTIME_BLOCKED_SIMULATED_FIXTURE')
    expect(result.executable).toBe(false)
  })
  it('does not issue real authority for a simulated Claude completion', () => {
    const c = new OfflineCoordinator(demoGraph()),
      auth = authorization(c, 'claude', 'x')
    expect(evaluateOfflineGrant(auth.grant, auth.request, auth.facts).code).toBe(
      'BLOCKED_UNSUPPORTED_CLAUDE_PERMISSION_CHANNEL',
    )
    expect(demoRun().nodes[2].status).toBe('completed')
  })
  it('cannot start without a grant or before dependencies', () => {
    const c = new OfflineCoordinator(demoGraph()),
      auth = authorization(c, 'gg', 'n')
    expect(() => c.start('gg', 'no', { ...auth, grant: null })).toThrow('NO_GRANT')
    expect(() => c.start('codex', 'early', authorization(c, 'codex', 'n2'))).toThrow(
      'DEPENDENCIES_NOT_COMPLETED',
    )
    expect(c.snapshot().trace).toHaveLength(0)
  })
  it('pauses for explicit human fixture approval and has no autoapprove', () => {
    const c = new OfflineCoordinator(demoGraph())
    c.start('gg', 'gg', authorization(c, 'gg', 'n'))
    finishFixture(c, 'gg')
    c.start('codex', 'codex', authorization(c, 'codex', 'n2'))
    expect(c.snapshot().nodes[1].status).toBe('waiting-approval')
    expect(() =>
      c.approve(
        'codex',
        'agentapprove',
        'allow',
        'worker-fixture',
        authorization(c, 'codex', 'n3', 'resume'),
      ),
    ).toThrow('NON_DELEGABLE_APPROVAL')
    c.approve(
      'codex',
      'humanapprove',
      'deny',
      'human-fixture',
      authorization(c, 'codex', 'n3', 'resume'),
    )
    expect(c.snapshot().status).toBe('failed')
    expect(c.snapshot().nodes[2].status).toBe('cancelled')
  })
  it('times out pending approval deterministically', () => {
    const c = new OfflineCoordinator(demoGraph())
    c.start('gg', 'gg', authorization(c, 'gg', 'n'))
    finishFixture(c, 'gg')
    c.start('codex', 'codex', authorization(c, 'codex', 'n2'))
    c.advanceClock(3, 'clock')
    expect(c.snapshot().nodes[1].reason).toBe('APPROVAL_TIMEOUT')
    expect(c.snapshot().availableUnits).toBe(14)
  })
  it('times out running fixtures and propagates dependency cancellation', () => {
    const c = new OfflineCoordinator(demoGraph())
    c.start('gg', 'gg', authorization(c, 'gg', 'n'))
    c.advanceClock(10, 'clock')
    expect(c.snapshot().nodes.map((n) => n.status)).toEqual(['failed', 'cancelled', 'cancelled'])
    expect(c.snapshot().nodes[0].reason).toBe('RUN_TIMEOUT')
  })
  it('cancels running fixtures once under an explicit grant', () => {
    const c = new OfflineCoordinator(demoGraph())
    c.start('gg', 'start', authorization(c, 'gg', 'n'))
    const auth = authorization(c, 'gg', 'ncancel', 'cancel')
    c.cancel('gg', 'cancel', 'human-fixture', auth)
    const before = c.snapshot()
    c.cancel('gg', 'cancel', 'human-fixture', auth)
    expect(c.snapshot()).toEqual(before)
    expect(before.status).toBe('cancelled')
    expect(() =>
      c.cancel('gg', 'another', 'human-fixture', authorization(c, 'gg', 'next', 'cancel')),
    ).toThrow('UNEXPECTED_CANCELLATION')
  })
  it('duplicate commands are idempotent and changed payload conflicts', () => {
    const c = new OfflineCoordinator(demoGraph()),
      auth = authorization(c, 'gg', 'n')
    c.start('gg', 'same', auth)
    const before = c.snapshot()
    c.start('gg', 'same', auth)
    expect(c.snapshot()).toEqual(before)
    expect(() => c.start('gg', 'same', authorization(c, 'gg', 'other'))).toThrow(
      'IDEMPOTENCY_CONFLICT',
    )
  })
  it.each(['projectId', 'nodeId', 'runId', 'attemptId'])(
    'rejects foreign %s and keeps state unchanged',
    (key) => {
      const c = new OfflineCoordinator(demoGraph()),
        a = structuredClone(authorization(c, 'gg', 'n'))
      Object.assign(a.request, { [key]: 'foreign' })
      const before = c.snapshot()
      expect(() => c.start('gg', 'foreign', a)).toThrow()
      expect(c.snapshot()).toEqual(before)
    },
  )
  it('rejects cross-project provider frames without advancing a cursor', () => {
    const c = new OfflineCoordinator(demoGraph())
    c.start('gg', 'gg', authorization(c, 'gg', 'n'))
    const scope = { ...c.scope('gg'), projectId: 'projectB' },
      before = c.snapshot()
    expect(() =>
      c.ingest('gg', frame(scope, 3, 'item/agentMessage/delta', { text: 'Foreign' })),
    ).toThrow('FOREIGN_EVENT_SCOPE')
    expect(c.snapshot()).toEqual(before)
  })
  it('provider tool approvals cannot be answered by provider output', () => {
    const c = new OfflineCoordinator(demoGraph())
    c.start('gg', 'gg', authorization(c, 'gg', 'n'))
    const s = c.scope('gg')
    c.ingest(
      'gg',
      frame(s, 3, 'item/commandExecution/requestApproval', { approvalId: 'readask', tool: 'read' }),
    )
    expect(c.snapshot().nodes[0].status).toBe('waiting-approval')
    expect(() =>
      c.ingest('gg', frame(s, 4, 'approval/answer', { approvalId: 'readask', decision: 'allow' })),
    ).toThrow('UNEXPECTED_NODE_STATE')
    c.approve(
      'gg',
      'allow',
      'allow',
      'human-fixture',
      authorization(c, 'gg', 'allowgrant', 'resume'),
    )
    expect(c.snapshot().nodes[0].status).toBe('running')
  })
  it('rejects undelegated tools and secret events atomically', () => {
    const c = new OfflineCoordinator(demoGraph())
    c.start('gg', 'gg', authorization(c, 'gg', 'n'))
    const scope = c.scope('gg'),
      before = c.snapshot()
    expect(() =>
      c.ingest('gg', frame(scope, 3, 'tool/request', { approvalId: 'a', tool: 'write' })),
    ).toThrow('NON_DELEGABLE_TOOL')
    expect(() =>
      c.ingest('gg', frame(scope, 3, 'item/agentMessage/delta', { text: 'Bearer fixture' })),
    ).toThrow('SECRET_MATERIAL')
    expect(c.snapshot()).toEqual(before)
  })
  it('unknown and exhausted budgets never fall back to paid mode', () => {
    const graph = demoGraph(),
      unknown = new OfflineCoordinator({ ...graph, budgetUnits: null })
    expect(() => unknown.start('gg', 'n', authorization(unknown, 'gg', 'n'))).toThrow(
      'UNKNOWN_BUDGET',
    )
    const c = new OfflineCoordinator(graph)
    c.start('gg', 'gg', authorization(c, 'gg', 'n'))
    c.ingest('gg', frame(c.scope('gg'), 3, 'thread/tokenUsage/updated', { units: 6 }))
    expect(c.snapshot().nodes[0].reason).toBe('BUDGET_EXHAUSTED')
    expect(c.snapshot().spentUnits).toBe(0)
  })
  it('bounded retries use fresh attempt scope and exactly-once output', () => {
    const c = new OfflineCoordinator(demoGraph())
    c.start('gg', 'start', authorization(c, 'gg', 'n'))
    c.ingest('gg', frame(c.scope('gg'), 3, 'turn/failed', { text: 'Fixture error' }))
    expect(() => c.retry('gg', 'old', authorization(c, 'gg', 'n2'))).toThrow('FIXTURE_GRANT_SCOPE')
    const auth = authorization(c, 'gg', 'n2', 'start', 2)
    c.retry('gg', 'retry', auth)
    const before = c.snapshot()
    c.retry('gg', 'retry', auth)
    expect(c.snapshot()).toEqual(before)
    finishFixture(c, 'gg')
    expect(c.snapshot().trace.filter((e) => e.kind === 'handoff')).toHaveLength(1)
  })
  it('enforces attempt limit rather than restarting forever', () => {
    const c = new OfflineCoordinator(demoGraph())
    c.start('gg', 'start', authorization(c, 'gg', 'n'))
    c.ingest('gg', frame(c.scope('gg'), 3, 'turn/failed', { text: 'Error' }))
    c.retry('gg', 'retry', authorization(c, 'gg', 'n2', 'start', 2))
    c.ingest('gg', frame(c.scope('gg'), 3, 'turn/failed', { text: 'Again' }))
    expect(() => c.retry('gg', 'retry3', authorization(c, 'gg', 'n3', 'start', 3))).toThrow(
      'ATTEMPT_LIMIT',
    )
  })
  it.each([
    'cycle',
    'duplicate',
    'foreignDependency',
    'missingGG',
    'extraCommand',
    'unknownProvider',
  ])('rejects graph %s', (test) => {
    const g = structuredClone(demoGraph())
    if (test === 'cycle') Object.assign(g.nodes[0], { dependsOn: ['claude'] })
    if (test === 'duplicate') Object.assign(g.nodes[1], { id: 'gg' })
    if (test === 'foreignDependency') Object.assign(g.nodes[1], { dependsOn: ['projectB_node'] })
    if (test === 'missingGG') Object.assign(g.nodes[0], { role: 'worker' })
    if (test === 'extraCommand') Object.assign(g.nodes[0], { command: 'shell' })
    if (test === 'unknownProvider') Object.assign(g.nodes[1], { provider: 'other' })
    expect(() => new OfflineCoordinator(g)).toThrow()
  })
  it('does not leak authorization references or sessions into snapshots', () => {
    expect(JSON.stringify(demoRun())).not.toMatch(/authref:|authRef|sessionRef|approvalRef|noncegg/)
  })
})
