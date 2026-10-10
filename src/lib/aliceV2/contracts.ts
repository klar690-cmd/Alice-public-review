/** M1 data contracts only: none of these values confer runtime authority. */
export const SIMULATION_ONLY = 'SIMULATION_ONLY' as const
export type Scope = Readonly<{ ownerId: string; profileId: string; configId: string }>
export type Port = Readonly<{
  id: string
  direction: 'input' | 'output'
  schema: 'message.v1'
  required: boolean
}>
export type AgentNode = Readonly<{
  id: string
  kind: 'agent'
  scope: Scope
  provider: 'fake'
  capability: 'fake.message'
  behavior: 'produce' | 'review'
  role: string
  prompt: string
  join: 'all'
  ports: readonly Port[]
}>
export type ControlEdge = Readonly<{ id: string; kind: 'control'; from: string; to: string }>
export type Endpoint = Readonly<{ nodeId: string; portId: string }>
export type DataEdge = Readonly<{ id: string; kind: 'data'; from: Endpoint; to: Endpoint }>
export type FakeBudget = Readonly<{
  known: true
  maxSteps: number
  maxRetries: number
  maxMessageChars: number
  maxTicks: number
}>
export type GraphDocument = Readonly<{
  schemaVersion: 1
  scope: Scope
  revision: number
  name: string
  nodes: readonly AgentNode[]
  controlEdges: readonly ControlEdge[]
  dataEdges: readonly DataEdge[]
  budget: FakeBudget
}>
export type PlanStep = Readonly<{
  nodeId: string
  dependsOn: readonly string[]
  receives: readonly DataEdge[]
  semantics: readonly [
    'wait.dependencies',
    'check.fake-grant',
    'invoke.fake-agent',
    'validate.output',
  ]
}>
export type PlanningDescriptor = Readonly<{
  format: 'alice.n8n-shaped-plan.v1'
  mode: typeof SIMULATION_ONLY
  executable: false
  workflowPublished: false
  trigger: 'manual.simulated'
  graphDigest: string
  graph: GraphDocument
  steps: readonly PlanStep[]
}>
export type RunIdentity = Readonly<{
  runId: string
  correlationId: string
  scope: Scope
  graphDigest: string
  revision: number
}>
export type RunSnapshot = Readonly<{
  mode: typeof SIMULATION_ONLY
  identity: RunIdentity
  plan: PlanningDescriptor
}>
export type FakeGrant = Readonly<{
  mode: typeof SIMULATION_ONLY
  realAccess: false
  identity: RunIdentity
  decision: 'approved' | 'denied'
  action: 'fake.handoff'
  issuedAtTick: number
  expiresAtTick: number
}>
export type Message = Readonly<{
  schemaVersion: 1
  kind: 'message'
  identity: RunIdentity
  nodeId: string
  sessionId: string
  content: string
}>
export type Status =
  'queued' | 'running' | 'waiting-approval' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted'
export const ERROR_CODES = [
  'MALFORMED',
  'SCHEMA_VERSION',
  'SECRET_FIELD',
  'UNKNOWN_FIELD',
  'UNSAFE_ID',
  'DUPLICATE_ID',
  'OWNER_SCOPE',
  'UNSUPPORTED_PROVIDER',
  'PORT_SCHEMA',
  'PORT_DIRECTION',
  'DANGLING_REF',
  'CYCLE',
  'MISSING_INPUT',
  'IMPOSSIBLE_JOIN',
  'UNKNOWN_BUDGET',
  'INVALID_BUDGET',
  'GRANT_MISMATCH',
  'GRANT_DENIED',
  'GRANT_EXPIRED',
  'UNTRUSTED_OUTPUT',
  'SNAPSHOT_MISMATCH',
  'CHECKPOINT_INVALID',
  'TIMEOUT',
  'RETRY_EXHAUSTED',
  'BUDGET_EXCEEDED',
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]
export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly path: string,
  ) {
    super(`${code}:${path}`)
    this.name = 'AliceV2DomainError'
  }
}
export type TraceEvent = Readonly<{
  eventId: string
  sequence: number
  tick: number
  kind: 'status' | 'handoff' | 'retry' | 'recovered'
  nodeId: string | null
  status: Status
  code: ErrorCode | null
}>
export type NodeProgress = Readonly<{
  nodeId: string
  sessionId: string
  status: Status
  attempts: number
  failures: number
}>
export type FakeReceipt = Readonly<{ key: string; message: Message }>
export type FakeCheckpoint = Readonly<{
  schemaVersion: 1
  mode: typeof SIMULATION_ONLY
  identity: RunIdentity
  status: Status
  tick: number
  nodes: readonly NodeProgress[]
  receipts: readonly FakeReceipt[]
  delivered: readonly string[]
  events: readonly TraceEvent[]
  integrityDigest: string
}>
export type FakeRunInput = Readonly<{
  identity: RunIdentity
  nowTick: number
  grant?: FakeGrant
  checkpoint?: FakeCheckpoint
  resume?: boolean
  interrupt?: Readonly<{ nodeId: string; stage: 'before-effect' | 'after-effect' }>
  cancelAtNode?: string
  timeoutAtNode?: string
  transientFailures?: readonly Readonly<{ nodeId: string; count: number }>[]
  outputOverrides?: readonly Readonly<{ nodeId: string; output: unknown }>[]
  replayEventIds?: readonly string[]
}>
export type FakeRunResult = Readonly<{
  mode: typeof SIMULATION_ONLY
  realAccess: false
  status: Status
  code: ErrorCode | null
  snapshot: RunSnapshot
  checkpoint: FakeCheckpoint
}>
/** Call only on validated JSON-shaped data. Copies isolate callers and freezes snapshots. */
export function immutable<T>(value: T): T {
  const copy: T = JSON.parse(JSON.stringify(value)) as T
  const freeze = (item: unknown): void => {
    if (item !== null && typeof item === 'object') {
      Object.values(item).forEach(freeze)
      Object.freeze(item)
    }
  }
  freeze(copy)
  return copy
}
