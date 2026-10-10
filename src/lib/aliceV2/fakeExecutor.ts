import { compileGraph, sha256, stableJson } from './compile'
import {
  DomainError,
  ERROR_CODES,
  type ErrorCode,
  type FakeReceipt,
  type FakeRunInput,
  type FakeRunResult,
  immutable,
  type Message,
  type NodeProgress,
  type PlanningDescriptor,
  type RunIdentity,
  SIMULATION_ONLY,
  type Status,
  type TraceEvent,
} from './contracts'
import {
  id,
  identity,
  integer,
  list,
  record,
  sameIdentity,
  sameScope,
  validateGrant,
  validateOutput,
} from './validate'

const STATUSES: readonly Status[] = [
  'queued',
  'running',
  'waiting-approval',
  'succeeded',
  'failed',
  'cancelled',
  'interrupted',
]
type Progress = { -readonly [K in keyof NodeProgress]: NodeProgress[K] }
type State = {
  identity: RunIdentity
  status: Status
  tick: number
  nodes: Progress[]
  receipts: FakeReceipt[]
  delivered: string[]
  events: TraceEvent[]
}
const session = (run: RunIdentity, nodeId: string) =>
  `fake_session_${sha256(stableJson([run, nodeId]))}`
const effect = (run: RunIdentity, nodeId: string) =>
  `fake_effect_${sha256(stableJson([run, nodeId]))}`
const eventKey = (run: RunIdentity, sequence: number) =>
  `fake_event_${sha256(stableJson(run))}_${sequence}`
const status = (value: unknown): Status => {
  if (!STATUSES.includes(value as Status)) throw new DomainError('CHECKPOINT_INVALID', 'status')
  return value as Status
}
function restore(value: unknown, run: RunIdentity, plan: PlanningDescriptor): State {
  const c = record(
    value,
    [
      'schemaVersion',
      'mode',
      'identity',
      'status',
      'tick',
      'nodes',
      'receipts',
      'delivered',
      'events',
      'integrityDigest',
    ],
    'checkpoint',
  )
  if (
    c.schemaVersion !== 1 ||
    c.mode !== SIMULATION_ONLY ||
    !sameIdentity(identity(c.identity), run)
  )
    throw new DomainError('SNAPSHOT_MISMATCH', 'checkpoint')
  const nodes = list(c.nodes, 64, 'checkpoint.nodes').map((value) => {
    const n = record(value, ['nodeId', 'sessionId', 'status', 'attempts', 'failures'], 'progress'),
      nodeId = id(n.nodeId, 'progress')
    if (!plan.steps.some((s) => s.nodeId === nodeId) || n.sessionId !== session(run, nodeId))
      throw new DomainError('CHECKPOINT_INVALID', 'session')
    return {
      nodeId,
      sessionId: n.sessionId as string,
      status: status(n.status),
      attempts: integer(n.attempts, 0, plan.graph.budget.maxSteps, 'attempts'),
      failures: integer(n.failures, 0, plan.graph.budget.maxRetries + 1, 'failures'),
    }
  })
  if (
    nodes.length !== plan.steps.length ||
    new Set(nodes.map((n) => n.nodeId)).size !== nodes.length
  )
    throw new DomainError('CHECKPOINT_INVALID', 'nodes')
  const receipts = list(c.receipts, 64, 'receipts').map((value) => {
    const r = record(value, ['key', 'message'], 'receipt'),
      m = record(
        r.message,
        ['schemaVersion', 'kind', 'identity', 'nodeId', 'sessionId', 'content'],
        'receipt.message',
      )
    const nodeId = id(m.nodeId, 'receipt.node')
    if (!nodes.some((n) => n.nodeId === nodeId) || r.key !== effect(run, nodeId))
      throw new DomainError('CHECKPOINT_INVALID', 'receipt')
    return {
      key: r.key as string,
      message: validateOutput(
        m,
        run,
        nodeId,
        session(run, nodeId),
        plan.graph.budget.maxMessageChars,
      ),
    }
  })
  if (new Set(receipts.map((r) => r.key)).size !== receipts.length)
    throw new DomainError('CHECKPOINT_INVALID', 'duplicate.receipt')
  const delivered = list(c.delivered, 256, 'delivered').map((v) => id(v, 'delivery'))
  if (
    new Set(delivered).size !== delivered.length ||
    delivered.some((v) => !plan.graph.dataEdges.some((e) => e.id === v))
  )
    throw new DomainError('CHECKPOINT_INVALID', 'delivery')
  const events = list(c.events, plan.graph.budget.maxTicks + 1, 'events').map((value, i) => {
    const e = record(
      value,
      ['eventId', 'sequence', 'tick', 'kind', 'nodeId', 'status', 'code'],
      'event',
    )
    if (
      e.sequence !== i + 1 ||
      e.eventId !== eventKey(run, i + 1) ||
      !['status', 'handoff', 'retry', 'recovered'].includes(e.kind as string) ||
      !(e.nodeId === null || nodes.some((n) => n.nodeId === e.nodeId)) ||
      !(e.code === null || ERROR_CODES.includes(e.code as ErrorCode))
    )
      throw new DomainError('CHECKPOINT_INVALID', 'event')
    return {
      eventId: e.eventId as string,
      sequence: i + 1,
      tick: integer(e.tick, 0, 1_000_000, 'event.tick'),
      kind: e.kind as TraceEvent['kind'],
      nodeId: e.nodeId as string | null,
      status: status(e.status),
      code: e.code as ErrorCode | null,
    }
  })
  const tick = integer(c.tick, 0, 1_000_000, 'tick')
  if (events.some((e, i) => e.tick > tick || (i > 0 && e.tick <= events[i - 1].tick)))
    throw new DomainError('CHECKPOINT_INVALID', 'clock')
  const state: State = {
    identity: run,
    status: status(c.status),
    tick,
    nodes,
    receipts,
    delivered,
    events,
  }
  if (
    nodes.some((n) => n.failures > n.attempts) ||
    nodes.reduce((sum, n) => sum + n.attempts, 0) > plan.graph.budget.maxSteps
  )
    throw new DomainError('CHECKPOINT_INVALID', 'attempts')
  for (const n of nodes)
    if (n.status === 'succeeded' && !receipts.some((r) => r.message.nodeId === n.nodeId))
      throw new DomainError('CHECKPOINT_INVALID', 'missing.receipt')
  if (state.status === 'succeeded' && nodes.some((n) => n.status !== 'succeeded'))
    throw new DomainError('CHECKPOINT_INVALID', 'completion')
  const body = { schemaVersion: 1, mode: SIMULATION_ONLY, ...state }
  if (c.integrityDigest !== sha256(stableJson(body)))
    throw new DomainError('CHECKPOINT_INVALID', 'integrity')
  // A saved in-flight status is history, not evidence of a live session after restart.
  if (state.status === 'running' || state.status === 'queued') {
    state.status = 'interrupted'
    state.nodes.forEach((n) => {
      if (n.status === 'running') n.status = 'interrupted'
    })
  }
  return state
}
/** Pure in-memory simulation. No callback, native provider, timer, storage or network adapter. */
export function simulateGraph(graph: unknown, input: FakeRunInput): FakeRunResult {
  const plan = compileGraph(graph),
    i = record(
      input,
      [
        'identity',
        'nowTick',
        'grant',
        'checkpoint',
        'resume',
        'interrupt',
        'cancelAtNode',
        'timeoutAtNode',
        'transientFailures',
        'outputOverrides',
        'replayEventIds',
      ],
      'run',
    )
  const run = identity(i.identity),
    now = integer(i.nowTick, 0, 900_000, 'nowTick')
  if (
    !sameScope(run.scope, plan.graph.scope) ||
    run.revision !== plan.graph.revision ||
    run.graphDigest !== plan.graphDigest
  )
    throw new DomainError('SNAPSHOT_MISMATCH', 'run')
  if (i.resume !== undefined && typeof i.resume !== 'boolean')
    throw new DomainError('MALFORMED', 'resume')
  const assertNode = (value: unknown): string => {
    const node = id(value, 'option.node')
    if (!plan.steps.some((s) => s.nodeId === node)) throw new DomainError('DANGLING_REF', 'option')
    return node
  }
  const cancelAt = i.cancelAtNode === undefined ? null : assertNode(i.cancelAtNode),
    timeoutAt = i.timeoutAtNode === undefined ? null : assertNode(i.timeoutAtNode)
  let interrupt: FakeRunInput['interrupt']
  if (i.interrupt !== undefined) {
    const r = record(i.interrupt, ['nodeId', 'stage'], 'interrupt')
    if (!['before-effect', 'after-effect'].includes(r.stage as string))
      throw new DomainError('MALFORMED', 'stage')
    interrupt = { nodeId: assertNode(r.nodeId), stage: r.stage as 'before-effect' | 'after-effect' }
  }
  const failures = list(i.transientFailures ?? [], 64, 'failures').map((v) => {
    const r = record(v, ['nodeId', 'count'], 'failure')
    return { nodeId: assertNode(r.nodeId), count: integer(r.count, 0, 9, 'count') }
  })
  const overrides = list(i.outputOverrides ?? [], 64, 'overrides').map((v) => {
    const r = record(v, ['nodeId', 'output'], 'override')
    return { nodeId: assertNode(r.nodeId), output: r.output }
  })
  if (
    new Set(failures.map((f) => f.nodeId)).size !== failures.length ||
    new Set(overrides.map((f) => f.nodeId)).size !== overrides.length
  )
    throw new DomainError('DUPLICATE_ID', 'options')
  const state: State =
    i.checkpoint === undefined
      ? {
          identity: run,
          status: 'queued',
          tick: now,
          nodes: plan.steps.map((s) => ({
            nodeId: s.nodeId,
            sessionId: session(run, s.nodeId),
            status: 'queued',
            attempts: 0,
            failures: 0,
          })),
          receipts: [],
          delivered: [],
          events: [],
        }
      : restore(i.checkpoint, run, plan)
  const result = (
    code: ErrorCode | null = state.status === 'failed'
      ? (state.events[state.events.length - 1]?.code ?? null)
      : null,
  ): FakeRunResult => {
    const body = { schemaVersion: 1 as const, mode: SIMULATION_ONLY, ...state }
    return immutable({
      mode: SIMULATION_ONLY,
      realAccess: false,
      status: state.status,
      code,
      snapshot: { mode: SIMULATION_ONLY, identity: run, plan },
      checkpoint: { ...body, integrityDigest: sha256(stableJson(body)) },
    })
  }
  // Replayed deliveries are acknowledgements only; never append events or re-run effects.
  const knownEvents = new Set(state.events.map((e) => e.eventId))
  for (const replay of list(i.replayEventIds ?? [], 8192, 'replay'))
    if (typeof replay !== 'string' || !knownEvents.has(replay))
      throw new DomainError('CHECKPOINT_INVALID', 'replay')
  if (
    i.checkpoint !== undefined &&
    (['succeeded', 'failed', 'cancelled'].includes(state.status) || i.resume !== true)
  )
    return result()
  state.tick = Math.max(state.tick, now)
  const emit = (
    kind: TraceEvent['kind'],
    nodeId: string | null,
    s: Status,
    code: ErrorCode | null = null,
  ): void => {
    if (state.events.length >= plan.graph.budget.maxTicks)
      throw new DomainError('BUDGET_EXCEEDED', 'ticks')
    state.tick++
    const sequence = state.events.length + 1
    state.events.push({
      eventId: eventKey(run, sequence),
      sequence,
      tick: state.tick,
      kind,
      nodeId,
      status: s,
      code,
    })
  }
  const progress = (nodeId: string) => state.nodes.find((n) => n.nodeId === nodeId)!
  try {
    if (!state.events.length) state.nodes.forEach((n) => emit('status', n.nodeId, 'queued'))
    if (i.grant === undefined) {
      state.status = 'waiting-approval'
      emit('status', null, 'waiting-approval')
      return result()
    }
    validateGrant(i.grant, run, state.tick)
    if (i.checkpoint !== undefined) {
      state.status = 'running'
      emit('recovered', null, 'running')
    }
    for (const step of plan.steps) {
      const p = progress(step.nodeId)
      if (p.status === 'succeeded') continue
      if (step.dependsOn.some((node) => progress(node).status !== 'succeeded'))
        throw new DomainError('CHECKPOINT_INVALID', 'dependency')
      if (cancelAt === p.nodeId) {
        p.status = 'cancelled'
        state.status = 'cancelled'
        emit('status', p.nodeId, 'cancelled')
        return result()
      }
      const receipt = state.receipts.find((r) => r.key === effect(run, p.nodeId))
      if (receipt) {
        validateOutput(
          receipt.message,
          run,
          p.nodeId,
          p.sessionId,
          plan.graph.budget.maxMessageChars,
        )
        p.status = 'succeeded'
        emit('recovered', p.nodeId, 'succeeded')
        continue
      }
      const inputs: Message[] = []
      for (const edge of step.receives) {
        validateGrant(i.grant, run, state.tick)
        const source = state.receipts.find((r) => r.message.nodeId === edge.from.nodeId)
        if (!source) throw new DomainError('MISSING_INPUT', edge.id)
        inputs.push(
          validateOutput(
            source.message,
            run,
            edge.from.nodeId,
            progress(edge.from.nodeId).sessionId,
            plan.graph.budget.maxMessageChars,
          ),
        )
        if (!state.delivered.includes(edge.id)) {
          state.delivered.push(edge.id)
          emit('handoff', p.nodeId, 'queued')
        }
      }
      const node = plan.graph.nodes.find((n) => n.id === p.nodeId)!,
        failureCount = failures.find((f) => f.nodeId === p.nodeId)?.count ?? 0
      while (true) {
        validateGrant(i.grant, run, state.tick)
        if (state.nodes.reduce((sum, n) => sum + n.attempts, 0) >= plan.graph.budget.maxSteps)
          throw new DomainError('BUDGET_EXCEEDED', 'steps')
        p.attempts++
        p.status = 'running'
        state.status = 'running'
        emit('status', p.nodeId, 'running')
        if (timeoutAt === p.nodeId) throw new DomainError('TIMEOUT', p.nodeId)
        if (p.failures < failureCount) {
          p.failures++
          if (p.failures > plan.graph.budget.maxRetries)
            throw new DomainError('RETRY_EXHAUSTED', p.nodeId)
          emit('retry', p.nodeId, 'queued')
          continue
        }
        if (interrupt?.nodeId === p.nodeId && interrupt.stage === 'before-effect') {
          p.status = 'interrupted'
          state.status = 'interrupted'
          emit('status', p.nodeId, 'interrupted')
          return result()
        }
        const content =
          node.behavior === 'produce'
            ? `[${node.id}] ${node.prompt}`
            : `[${node.id}] ${node.prompt} (${inputs.map((m) => m.content).join(' | ')})`
        const override = overrides.find((o) => o.nodeId === p.nodeId)
        const raw = override
          ? override.output
          : {
              schemaVersion: 1,
              kind: 'message',
              identity: run,
              nodeId: p.nodeId,
              sessionId: p.sessionId,
              content,
            }
        const message = validateOutput(
          raw,
          run,
          p.nodeId,
          p.sessionId,
          plan.graph.budget.maxMessageChars,
        )
        validateGrant(i.grant, run, state.tick)
        state.receipts.push({ key: effect(run, p.nodeId), message })
        if (interrupt?.nodeId === p.nodeId && interrupt.stage === 'after-effect') {
          p.status = 'interrupted'
          state.status = 'interrupted'
          emit('status', p.nodeId, 'interrupted')
          return result()
        }
        p.status = 'succeeded'
        emit('status', p.nodeId, 'succeeded')
        break
      }
    }
    state.status = 'succeeded'
    emit('status', null, 'succeeded')
    return result()
  } catch (error) {
    if (!(error instanceof DomainError)) throw error
    state.status = 'failed'
    const running = state.nodes.find((n) => n.status === 'running')
    if (running) running.status = 'failed'
    // A bounded terminal error record is still preserved if the normal tick budget was exhausted.
    const sequence = state.events.length + 1
    state.tick++
    state.events.push({
      eventId: eventKey(run, sequence),
      sequence,
      tick: state.tick,
      kind: 'status',
      nodeId: running?.nodeId ?? null,
      status: 'failed',
      code: error.code,
    })
    return result(error.code)
  }
}
