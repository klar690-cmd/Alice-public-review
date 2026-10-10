import { stableJson } from '../compile'
import {
  checkedScope,
  count,
  deny,
  fixtureId,
  immutable,
  OFFLINE,
  record,
} from '../offlineAdapters/contracts'
import { validateOfflineGraph } from '../offlineCoordinator/coordinator'
import { rejectSecretMaterial } from '../securityPolicy'

const STEPS = [
  'wait.dependencies',
  'check.offline-grant',
  'pause.human-fixture',
  'reserve.fixture-budget',
  'replay.fixture',
  'validate.mock-output',
  'handoff.once',
] as const

/** This representation is deliberately incompatible with a runnable n8n workflow. */
export function compileOfflineIR(graph: unknown) {
  const g = validateOfflineGraph(graph)
  if (g.budgetUnits === null) deny('UNKNOWN_BUDGET')
  if (g.budgetUnits < g.nodes.reduce((sum, n) => sum + n.maxUnits, 0)) deny('BUDGET_NOT_RESERVED')
  return immutable({
    format: 'alice.n8n.offline-ir.v1' as const,
    marker: OFFLINE,
    deployable: false as const,
    connectionState: 'not-connected' as const,
    executed: false as const,
    simulationOnly: true as const,
    executable: false as const,
    projectId: g.projectId,
    graphRevision: g.graphRevision,
    runId: g.runId,
    budgetUnits: g.budgetUnits,
    concurrency: 1 as const,
    approvalPolicy: 'human-fixture-explicit' as const,
    nodes: g.nodes.map((n) => ({
      ...n,
      projectId: g.projectId,
      graphRevision: g.graphRevision,
      runId: g.runId,
      attemptId: `${n.id}_attempt1`,
      method:
        n.provider === 'codex' ? 'codex.app-server.fixture-v1' : 'claude.stream-json.fixture-v1',
      runtimeState:
        n.provider === 'claude' ? 'UNAVAILABLE_BLOCKED_UNSUPPORTED' : 'NOT_NATIVE_CERTIFIED',
      nativeExecutable: false as const,
      steps: [...STEPS],
    })),
    edges: g.nodes.flatMap((n) =>
      n.dependsOn.map((from) => ({
        from,
        to: n.id,
        on: 'mock.completed' as const,
        projectId: g.projectId,
        graphRevision: g.graphRevision,
        runId: g.runId,
      })),
    ),
    callbackContract: {
      version: 'future-broker-required' as const,
      implemented: false as const,
      networkAccepted: false as const,
      proof: 'NONE_OFFLINE_UNTRUSTED' as const,
    },
  })
}
export type OfflineIR = ReturnType<typeof compileOfflineIR>

function denyWireMaterial(value: unknown, depth = 0): void {
  rejectSecretMaterial(value)
  if (depth > 12) deny('IR_LIMIT')
  if (
    typeof value === 'string' &&
    /authref:|:\/\/|\{\{|\}\}|\$\{|\.\.[\\/]|^[a-z]:[\\/]|^\\\\/i.test(value)
  )
    deny('FORBIDDEN_IR_MATERIAL')
  if (Array.isArray(value)) value.forEach((v) => denyWireMaterial(v, depth + 1))
  else if (value && typeof value === 'object')
    for (const [key, v] of Object.entries(value)) {
      if (
        /authref|session|nonce|signature|signed|url|host|headers|command|expression|environment/i.test(
          key,
        )
      )
        deny('FORBIDDEN_IR_MATERIAL')
      denyWireMaterial(v, depth + 1)
    }
}

export function validateOfflineIR(value: unknown): OfflineIR {
  denyWireMaterial(value)
  const ir = record(value, [
    'format',
    'marker',
    'deployable',
    'connectionState',
    'executed',
    'simulationOnly',
    'executable',
    'projectId',
    'graphRevision',
    'runId',
    'budgetUnits',
    'concurrency',
    'approvalPolicy',
    'nodes',
    'edges',
    'callbackContract',
  ])
  if (!Array.isArray(ir.nodes) || ir.nodes.length > 16) deny('INVALID_IR')
  const nodes = ir.nodes.map((value) => {
    const n = record(value, [
      'id',
      'role',
      'provider',
      'dependsOn',
      'maxUnits',
      'tools',
      'needsApproval',
      'approvalTimeoutTicks',
      'deadlineTicks',
      'maxAttempts',
      'projectId',
      'graphRevision',
      'runId',
      'attemptId',
      'method',
      'runtimeState',
      'nativeExecutable',
      'steps',
    ])
    return {
      id: n.id,
      role: n.role,
      provider: n.provider,
      dependsOn: n.dependsOn,
      maxUnits: n.maxUnits,
      tools: n.tools,
      needsApproval: n.needsApproval,
      approvalTimeoutTicks: n.approvalTimeoutTicks,
      deadlineTicks: n.deadlineTicks,
      maxAttempts: n.maxAttempts,
    }
  })
  const expected = compileOfflineIR({
    marker: ir.marker,
    schemaVersion: 1,
    projectId: ir.projectId,
    graphRevision: ir.graphRevision,
    runId: ir.runId,
    budgetUnits: ir.budgetUnits,
    nodes,
  })
  if (stableJson(value) !== stableJson(expected)) deny('IR_SCOPE_OR_CONTRACT_MISMATCH')
  return expected
}
export function serializeOfflineIR(value: unknown): string {
  return stableJson(validateOfflineIR(value))
}

export type CallbackLedger = Readonly<{
  projectId: string
  graphRevision: number
  runId: string
  cursors: readonly Readonly<{ nodeId: string; attemptId: string; cursor: number }>[]
}>
export function initialCallbackLedger(value: unknown): CallbackLedger {
  const ir = validateOfflineIR(value)
  return immutable({
    projectId: ir.projectId,
    graphRevision: ir.graphRevision,
    runId: ir.runId,
    cursors: ir.nodes.map((n) => ({ nodeId: n.id, attemptId: n.attemptId, cursor: 0 })),
  })
}

/** Offline correlation/replay exercise, not signature verification or a network callback. */
export function validateCallbackFixture(value: unknown, callback: unknown, ledger: unknown) {
  const ir = validateOfflineIR(value)
  denyWireMaterial(callback)
  const cb = record(callback, ['marker', 'format', 'scope', 'sequence', 'event', 'proof'])
  if (
    cb.marker !== OFFLINE ||
    cb.format !== 'alice.n8n.callback-fixture.v1' ||
    cb.proof !== 'NONE_OFFLINE_UNTRUSTED' ||
    !['mock.completed', 'mock.cancelled', 'mock.approval-required'].includes(String(cb.event))
  )
    deny('NOT_AN_OFFLINE_CALLBACK')
  const scope = checkedScope(cb.scope)
  count(cb.sequence)
  const node = ir.nodes.find((n) => n.id === scope.nodeId)
  if (
    !node ||
    scope.projectId !== ir.projectId ||
    scope.graphRevision !== ir.graphRevision ||
    scope.runId !== ir.runId ||
    scope.attemptId !== node.attemptId ||
    scope.provider !== node.provider
  )
    deny('FOREIGN_CALLBACK_SCOPE')
  const l = record(ledger, ['projectId', 'graphRevision', 'runId', 'cursors'])
  if (
    l.projectId !== ir.projectId ||
    l.graphRevision !== ir.graphRevision ||
    l.runId !== ir.runId ||
    !Array.isArray(l.cursors) ||
    l.cursors.length !== ir.nodes.length
  )
    deny('FOREIGN_CALLBACK_LEDGER')
  const cursors = l.cursors.map((value) => {
    const c = record(value, ['nodeId', 'attemptId', 'cursor'])
    fixtureId(c.nodeId)
    fixtureId(c.attemptId)
    count(c.cursor)
    if (!ir.nodes.some((n) => n.id === c.nodeId && n.attemptId === c.attemptId))
      deny('FOREIGN_CALLBACK_LEDGER')
    return { nodeId: c.nodeId, attemptId: c.attemptId, cursor: c.cursor }
  })
  if (new Set(cursors.map((c) => c.nodeId)).size !== cursors.length)
    deny('DUPLICATE_CALLBACK_LEDGER')
  const cursor = cursors.find((c) => c.nodeId === scope.nodeId)!
  if (cb.sequence !== cursor.cursor + 1) deny('CALLBACK_REPLAY_OR_ORDER')
  return immutable({
    acceptedOnlyAsFixture: true as const,
    executable: false as const,
    nextLedger: {
      projectId: ir.projectId,
      graphRevision: ir.graphRevision,
      runId: ir.runId,
      cursors: cursors.map((c) =>
        c.nodeId === scope.nodeId ? { ...c, cursor: cb.sequence as number } : c,
      ),
    },
  })
}
