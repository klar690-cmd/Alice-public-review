import { sha256, stableJson } from '../compile'
import { OfflineAdapter } from '../offlineAdapters/adapter'
import {
  checkedScope,
  count,
  deny,
  fixtureId,
  immutable,
  OFFLINE,
  record,
  sameScope,
} from '../offlineAdapters/contracts'
import { frame } from '../offlineAdapters/fixtures'
import {
  type AuthorityFacts,
  evaluateOfflineGrant,
  type OfflineGrant,
  type OfflineRequest,
  rejectSecretMaterial,
  type Scope,
  type Tool,
} from '../securityPolicy'

export type NodeSpec = Readonly<{
  id: string
  role: 'gg' | 'worker'
  provider: 'codex' | 'claude'
  dependsOn: readonly string[]
  maxUnits: number
  tools: readonly Tool[]
  needsApproval: boolean
  approvalTimeoutTicks: number
  deadlineTicks: number
  maxAttempts: number
}>
export type OfflineGraph = Readonly<{
  marker: typeof OFFLINE
  schemaVersion: 1
  projectId: string
  graphRevision: number
  runId: string
  budgetUnits: number | null
  nodes: readonly NodeSpec[]
}>
export type FixtureAuthorization = Readonly<{
  marker: typeof OFFLINE
  grant: OfflineGrant | null
  request: OfflineRequest
  facts: AuthorityFacts
}>
type Status = 'queued' | 'waiting-approval' | 'running' | 'completed' | 'failed' | 'cancelled'
type NodeState = {
  allowedTools: readonly Tool[]
  spec: NodeSpec
  status: Status
  attempt: number
  reservation: number
  spent: number
  startedAt: number | null
  approvalDeadline: number | null
  approvalId: string | null
  reason: string | null
  adapter: OfflineAdapter | null
}
type Trace = Readonly<{
  marker: typeof OFFLINE
  sequence: number
  eventId: string
  scope: Scope
  kind: string
  detail: string
}>

export function validateOfflineGraph(value: unknown): OfflineGraph {
  const g = record(value, [
    'marker',
    'schemaVersion',
    'projectId',
    'graphRevision',
    'runId',
    'budgetUnits',
    'nodes',
  ])
  if (g.marker !== OFFLINE || g.schemaVersion !== 1) deny('NOT_AN_OFFLINE_GRAPH')
  fixtureId(g.projectId)
  fixtureId(g.runId)
  count(g.graphRevision)
  if (g.budgetUnits !== null) count(g.budgetUnits)
  if (!Array.isArray(g.nodes) || g.nodes.length < 1 || g.nodes.length > 16) deny('NODE_LIMIT')
  const nodes: NodeSpec[] = g.nodes.map((value) => {
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
    ])
    fixtureId(n.id)
    if (n.id.length > 32) deny('NODE_ID_LIMIT')
    if (
      !['gg', 'worker'].includes(String(n.role)) ||
      !['codex', 'claude'].includes(String(n.provider))
    )
      deny('UNSUPPORTED_NODE')
    if (
      !Array.isArray(n.dependsOn) ||
      n.dependsOn.length > 16 ||
      new Set(n.dependsOn).size !== n.dependsOn.length
    )
      deny('INVALID_DEPENDENCIES')
    n.dependsOn.forEach(fixtureId)
    if (
      !Array.isArray(n.tools) ||
      n.tools.length > 3 ||
      new Set(n.tools).size !== n.tools.length ||
      n.tools.some((t) => !['read', 'write', 'test'].includes(String(t)))
    )
      deny('NON_DELEGABLE_TOOL')
    for (const key of ['maxUnits', 'approvalTimeoutTicks', 'deadlineTicks', 'maxAttempts']) {
      count(n[key])
      if ((n[key] as number) < 1) deny('INVALID_LIMIT')
    }
    if (
      (n.maxAttempts as number) > 3 ||
      (n.deadlineTicks as number) > 10000 ||
      (n.approvalTimeoutTicks as number) > 10000 ||
      (n.maxUnits as number) > 10000 ||
      typeof n.needsApproval !== 'boolean'
    )
      deny('INVALID_LIMIT')
    return structuredClone(n) as unknown as NodeSpec
  })
  const ids = nodes.map((n) => n.id)
  if (new Set(ids).size !== ids.length) deny('DUPLICATE_NODE')
  if (nodes.some((n) => n.dependsOn.some((id) => !ids.includes(id)))) deny('UNKNOWN_DEPENDENCY')
  const remaining = new Set(ids),
    ordered: string[] = []
  while (remaining.size) {
    const next = nodes
      .filter((n) => remaining.has(n.id) && n.dependsOn.every((id) => ordered.includes(id)))
      .sort((a, b) => a.id.localeCompare(b.id))[0]
    if (!next) deny('CYCLIC_GRAPH')
    ordered.push(next.id)
    remaining.delete(next.id)
  }
  const gg = nodes.filter((n) => n.role === 'gg')
  if (
    gg.length !== 1 ||
    gg[0].dependsOn.length !== 0 ||
    gg[0].provider !== 'codex' ||
    nodes.some((n) => n.role !== 'gg' && n.dependsOn.length === 0)
  )
    deny('INVALID_GG_ROOT')
  return immutable({
    marker: OFFLINE,
    schemaVersion: 1,
    projectId: g.projectId,
    graphRevision: g.graphRevision,
    runId: g.runId,
    budgetUnits: g.budgetUnits as number | null,
    nodes: ordered.map((id) => nodes.find((n) => n.id === id)!),
  })
}

/** Deterministic fixture scheduler. No durable issuer, process handles or provider transport. */
export class OfflineCoordinator {
  readonly graph: OfflineGraph
  private readonly nodes = new Map<string, NodeState>()
  private readonly commands = new Map<string, string>()
  private readonly nonces = new Set<string>()
  private readonly handoffs = new Set<string>()
  private readonly trace: Trace[] = []
  private tick = 0
  private available: number | null
  private spent = 0
  constructor(graph: unknown) {
    this.graph = validateOfflineGraph(graph)
    this.available = this.graph.budgetUnits
    this.graph.nodes.forEach((spec) =>
      this.nodes.set(spec.id, {
        spec,
        status: 'queued',
        attempt: 1,
        reservation: 0,
        spent: 0,
        startedAt: null,
        approvalDeadline: null,
        approvalId: null,
        reason: null,
        adapter: null,
        allowedTools: [],
      }),
    )
  }
  scope(nodeId: string, attempt?: number): Scope {
    const n = this.node(nodeId)
    return checkedScope({
      projectId: this.graph.projectId,
      graphRevision: this.graph.graphRevision,
      nodeId,
      runId: this.graph.runId,
      attemptId: `${nodeId}_attempt${attempt ?? n.attempt}`,
      provider: n.spec.provider,
      mode: n.spec.provider === 'codex' ? 'local-app-server' : 'local-cli-json',
    })
  }
  snapshot() {
    const nodes = [...this.nodes.values()].map((n) => ({
      nodeId: n.spec.id,
      status: n.status,
      attemptId: this.scope(n.spec.id).attemptId,
      reservation: n.reservation,
      spent: n.spent,
      reason: n.reason,
      cursor: n.adapter?.snapshot().cursor ?? 0,
      fixtureStatus:
        n.spec.provider === 'claude' ? 'RUNTIME_BLOCKED_SIMULATED_FIXTURE' : 'SIMULATED_ONLY',
    }))
    return immutable({
      marker: OFFLINE,
      executable: false as const,
      projectId: this.graph.projectId,
      graphRevision: this.graph.graphRevision,
      runId: this.graph.runId,
      tick: this.tick,
      status: nodes.some((n) => n.status === 'failed')
        ? 'failed'
        : nodes.every((n) => n.status === 'completed')
          ? 'completed'
          : nodes.every((n) => n.status === 'completed' || n.status === 'cancelled')
            ? 'cancelled'
            : 'in-progress',
      availableUnits: this.available,
      spentUnits: this.spent,
      nodes,
      trace: [...this.trace],
    })
  }
  private node(id: string): NodeState {
    fixtureId(id)
    const n = this.nodes.get(id)
    if (!n) deny('UNKNOWN_NODE')
    return n
  }
  private once(key: string, input: unknown, apply: () => void) {
    fixtureId(key)
    rejectSecretMaterial(input)
    const digest = sha256(stableJson(input)),
      previous = this.commands.get(key)
    if (previous) {
      if (previous !== digest) deny('IDEMPOTENCY_CONFLICT')
      return
    }
    if (this.commands.size >= 256) deny('COMMAND_LIMIT')
    if (this.trace.length + 32 > 1024) deny('TRACE_LIMIT')
    apply()
    this.commands.set(key, digest)
  }
  private emit(n: NodeState, kind: string, detail: string) {
    const sequence = this.trace.length + 1
    this.trace.push(
      immutable({
        marker: OFFLINE,
        sequence,
        eventId: `${this.graph.runId}_${n.spec.id}_${n.attempt}_${sequence}`,
        scope: this.scope(n.spec.id),
        kind,
        detail,
      }),
    )
  }
  private authorize(
    n: NodeState,
    action: 'start' | 'resume' | 'cancel',
    value: unknown,
    attempt = n.attempt,
  ) {
    const a = record(value, ['marker', 'grant', 'request', 'facts'])
    if (a.marker !== OFFLINE) deny('NOT_FIXTURE_AUTHORIZATION')
    if (a.grant === null) deny('NO_GRANT')
    if (this.available === null) deny('UNKNOWN_BUDGET')
    const facts = record(a.facts, [
      'kind',
      'nowMs',
      'workspaceRoot',
      'canonicalRoot',
      'canonicalCwd',
      'auth',
      'approvedGrant',
      'reservation',
      'spentNonces',
    ])
    const reservation = record(facts.reservation, ['projectId', 'reservationId', 'remainingUnits'])
    if (reservation.remainingUnits !== null) count(reservation.remainingUnits)
    if (!Array.isArray(facts.spentNonces)) deny('MALFORMED_FIXTURE')
    const prepared = {
      ...facts,
      nowMs: this.tick,
      spentNonces: [...facts.spentNonces, ...this.nonces],
      reservation: {
        ...reservation,
        remainingUnits:
          reservation.remainingUnits === null
            ? null
            : Math.min(reservation.remainingUnits, this.available + n.reservation),
      },
    }
    const result = evaluateOfflineGrant(a.grant, a.request, prepared)
    const scope = this.scope(n.spec.id, attempt)
    const eligible =
      result.code === 'ELIGIBLE_OFFLINE' ||
      (scope.provider === 'claude' &&
        result.code === 'BLOCKED_UNSUPPORTED_CLAUDE_PERMISSION_CHANNEL')
    if (!eligible) deny(result.code)
    // The Claude result is a denial of REAL execution; only transcript replay is simulated here.
    const g = a.grant as OfflineGrant,
      r = a.request as OfflineRequest
    if (
      !sameScope(scope, r) ||
      r.action !== action ||
      g.budgetUnits !== n.spec.maxUnits ||
      r.costUnits !== 0 ||
      r.policy.approval !== 'on-request' ||
      r.policy.sandbox !== 'workspace-write' ||
      r.tools.some((t) => !n.spec.tools.includes(t)) ||
      g.tools.some((t) => !n.spec.tools.includes(t))
    )
      deny('FIXTURE_GRANT_SCOPE')
    const session = action === 'start' ? null : `fixture_${n.spec.id}_${scope.attemptId}`
    if (r.sessionRef !== session) deny('FOREIGN_FIXTURE_SESSION')
    if (
      action !== 'start' &&
      n.startedAt !== null &&
      r.tools.some((t) => !n.allowedTools.includes(t))
    )
      deny('FIXTURE_GRANT_SCOPE')
    if (this.nonces.size >= 128) deny('NONCE_LIMIT')
    this.nonces.add(g.nonce)
    return Object.freeze([...r.tools])
  }
  private boot(n: NodeState) {
    const scope = this.scope(n.spec.id),
      codex = scope.provider === 'codex'
    n.adapter = new OfflineAdapter(scope)
    n.adapter.push(
      frame(scope, 1, codex ? 'thread/start' : 'fixture.init', {
        fixtureSessionId: `fixture_${n.spec.id}_${scope.attemptId}`,
      }),
    )
    n.adapter.push(
      frame(scope, 2, codex ? 'turn/start' : 'fixture.user', { text: 'Simulated assignment' }),
    )
    n.status = 'running'
    n.approvalDeadline = null
    n.approvalId = null
    this.emit(
      n,
      'started',
      n.spec.provider === 'claude' ? 'RUNTIME_BLOCKED_SIMULATED_FIXTURE' : 'SIMULATED_ONLY',
    )
  }
  private release(n: NodeState) {
    if (this.available !== null) this.available += n.reservation
    n.reservation = 0
  }
  private terminal(n: NodeState, status: 'failed' | 'cancelled', reason: string) {
    n.status = status
    n.reason = reason
    n.approvalId = null
    n.approvalDeadline = null
    this.release(n)
    this.emit(n, status, reason)
    for (const child of this.nodes.values())
      if (child.status === 'queued' && child.spec.dependsOn.includes(n.spec.id))
        this.terminal(child, 'cancelled', 'DEPENDENCY_FAILED')
  }
  start(nodeId: string, key: string, authorization: unknown) {
    this.once(key, { nodeId, authorization }, () => {
      const n = this.node(nodeId)
      if (n.status !== 'queued') deny('UNEXPECTED_NODE_STATE')
      if (n.spec.dependsOn.some((id) => this.node(id).status !== 'completed'))
        deny('DEPENDENCIES_NOT_COMPLETED')
      if (
        [...this.nodes.values()].some(
          (x) => x.status === 'running' || x.status === 'waiting-approval',
        )
      )
        deny('CONCURRENCY_LIMIT')
      n.allowedTools = this.authorize(n, 'start', authorization)
      this.available! -= n.spec.maxUnits
      n.reservation = n.spec.maxUnits
      n.startedAt = this.tick
      if (n.spec.needsApproval) {
        n.status = 'waiting-approval'
        n.approvalId = `approval_${nodeId}_${n.attempt}`
        n.approvalDeadline = this.tick + n.spec.approvalTimeoutTicks
        this.emit(n, 'approval-required', n.approvalId)
      } else this.boot(n)
    })
  }
  approve(
    nodeId: string,
    key: string,
    decision: 'allow' | 'deny',
    actor: string,
    authorization: unknown,
  ) {
    this.once(key, { nodeId, decision, actor, authorization }, () => {
      const n = this.node(nodeId)
      if (actor !== 'human-fixture') deny('NON_DELEGABLE_APPROVAL')
      if (n.status !== 'waiting-approval' || !['allow', 'deny'].includes(decision))
        deny('UNEXPECTED_APPROVAL')
      n.allowedTools = this.authorize(n, 'resume', authorization)
      if (n.adapter) {
        n.adapter.push(
          frame(this.scope(nodeId), n.adapter.snapshot().cursor + 1, 'approval/answer', {
            approvalId: n.approvalId,
            decision,
          }),
        )
      }
      if (decision === 'deny') {
        this.terminal(n, 'failed', 'APPROVAL_DENIED')
        return
      }
      if (n.adapter) {
        n.status = 'running'
        n.approvalDeadline = null
        n.approvalId = null
        this.emit(n, 'approval-allowed', 'human-fixture')
      } else this.boot(n)
    })
  }
  ingest(nodeId: string, value: unknown) {
    if (this.trace.length + 32 > 1024) deny('TRACE_LIMIT')
    const n = this.node(nodeId)
    if (n.status !== 'running' || !n.adapter) deny('UNEXPECTED_NODE_STATE')
    const next = n.adapter.fork(),
      event = next.push(value)
    if (event.kind === 'answer') deny('NON_DELEGABLE_APPROVAL')
    if (
      (event.kind === 'tool' || event.kind === 'approval') &&
      !n.allowedTools.includes(event.data.tool as Tool)
    )
      deny('NON_DELEGABLE_TOOL')
    if (event.kind === 'usage') {
      const units = event.data.units as number
      if (units > n.reservation) {
        this.terminal(n, 'failed', 'BUDGET_EXHAUSTED')
        return
      }
      n.reservation -= units
      n.spent += units
      this.spent += units
    }
    n.adapter = next
    this.emit(n, event.kind, event.eventId)
    if (event.kind === 'approval') {
      n.status = 'waiting-approval'
      n.approvalId = event.data.approvalId as string
      n.approvalDeadline = this.tick + n.spec.approvalTimeoutTicks
    } else if (event.kind === 'failed') {
      this.terminal(n, 'failed', 'PROVIDER_FIXTURE_ERROR')
    } else if (event.kind === 'completed') {
      n.status = 'completed'
      this.release(n)
      for (const child of this.nodes.values())
        if (child.spec.dependsOn.includes(nodeId)) {
          const id = `${nodeId}_${child.spec.id}_${n.attempt}`
          if (!this.handoffs.has(id)) {
            this.handoffs.add(id)
            this.emit(n, 'handoff', child.spec.id)
          }
        }
    } else if (event.kind === 'cancelled') {
      this.terminal(n, 'cancelled', 'FIXTURE_CANCELLED')
    }
  }
  cancel(nodeId: string, key: string, actor: string, authorization: unknown) {
    this.once(key, { nodeId, actor, authorization }, () => {
      const n = this.node(nodeId)
      if (actor !== 'human-fixture') deny('NON_DELEGABLE_CANCEL')
      if (['completed', 'failed', 'cancelled'].includes(n.status)) deny('UNEXPECTED_CANCELLATION')
      this.authorize(n, 'cancel', authorization)
      if (n.adapter) {
        const s = this.scope(nodeId),
          codex = s.provider === 'codex',
          cursor = n.adapter.snapshot().cursor
        n.adapter.push(
          frame(s, cursor + 1, codex ? 'turn/interrupt' : 'fixture.interrupt', {
            text: 'Simulated cancel',
          }),
        )
        n.adapter.push(
          frame(s, cursor + 2, codex ? 'turn/cancelled' : 'fixture.cancelled', {
            text: 'Simulated cancellation',
          }),
        )
      }
      this.terminal(n, 'cancelled', 'HUMAN_FIXTURE_CANCELLED')
    })
  }
  advanceClock(ticks: number, key: string) {
    count(ticks)
    if (ticks > 10000) deny('TICK_LIMIT')
    this.once(key, { ticks }, () => {
      this.tick += ticks
      for (const n of this.nodes.values()) {
        if (
          n.status === 'waiting-approval' &&
          n.approvalDeadline !== null &&
          this.tick >= n.approvalDeadline
        )
          this.terminal(n, 'failed', 'APPROVAL_TIMEOUT')
        else if (
          n.status === 'running' &&
          n.startedAt !== null &&
          this.tick - n.startedAt >= n.spec.deadlineTicks
        )
          this.terminal(n, 'failed', 'RUN_TIMEOUT')
      }
    })
  }
  retry(nodeId: string, key: string, authorization: unknown) {
    this.once(key, { nodeId, authorization }, () => {
      const n = this.node(nodeId)
      if (n.status !== 'failed') deny('UNEXPECTED_RETRY')
      if (n.attempt >= n.spec.maxAttempts) deny('ATTEMPT_LIMIT')
      if (n.spec.dependsOn.some((id) => this.node(id).status !== 'completed'))
        deny('DEPENDENCIES_NOT_COMPLETED')
      if (
        [...this.nodes.values()].some(
          (x) => x.status === 'running' || x.status === 'waiting-approval',
        )
      )
        deny('CONCURRENCY_LIMIT')
      n.allowedTools = this.authorize(n, 'start', authorization, n.attempt + 1)
      n.attempt++
      n.reason = null
      n.adapter = null
      n.spent = 0
      n.startedAt = this.tick
      this.available! -= n.spec.maxUnits
      n.reservation = n.spec.maxUnits
      const descendants = new Set<string>([nodeId])
      for (const child of this.nodes.values())
        if (child.spec.dependsOn.some((id) => descendants.has(id))) descendants.add(child.spec.id)
      for (const child of this.nodes.values())
        if (
          descendants.has(child.spec.id) &&
          child.status === 'cancelled' &&
          child.reason === 'DEPENDENCY_FAILED'
        ) {
          child.status = 'queued'
          child.reason = null
        }
      if (n.spec.needsApproval) {
        n.status = 'waiting-approval'
        n.approvalId = `approval_${nodeId}_${n.attempt}`
        n.approvalDeadline = this.tick + n.spec.approvalTimeoutTicks
        this.emit(n, 'approval-required', n.approvalId)
      } else this.boot(n)
    })
  }
}
