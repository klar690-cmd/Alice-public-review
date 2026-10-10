import { compileGraph } from './compile'
import {
  type AgentNode,
  type FakeRunInput,
  type FakeRunResult,
  type GraphDocument,
  immutable,
  type Status,
} from './contracts'
import { validateGraph } from './validate'

export type Position = Readonly<{ x: number; y: number }>
export type NodeLabel = Readonly<{ label: string; kind: 'manager' | 'worker' | 'reviewer' }>
export type Layout = Readonly<Record<string, Position>>
export type UiRun = Readonly<{ input: FakeRunInput; result: FakeRunResult; playhead: number }>
export type DemoCopy = Readonly<{
  names: readonly [string, string]
  roles: readonly [string, string, string]
  prompts: readonly [string, string, string]
  copy: string
  newAgent: string
  newPrompt: string
}>
export const defaultDemoCopy: DemoCopy = {
  names: ['Build & review', 'Plan an idea'],
  roles: ['General manager', 'Developer', 'Auditor'],
  prompts: ['Prepare the request', 'Develop a response', 'Review the response'],
  copy: 'copy',
  newAgent: 'Agent',
  newPrompt: 'Review the input',
}
export function demoGraph(
  configId: string,
  name: string,
  profileId = 'm2_session',
  copy: DemoCopy = defaultDemoCopy,
): GraphDocument {
  const scope = { ownerId: 'demo_owner', profileId, configId }
  const node = (
    id: string,
    behavior: AgentNode['behavior'],
    role: string,
    prompt: string,
  ): AgentNode => ({
    id,
    kind: 'agent',
    scope,
    provider: 'fake',
    capability: 'fake.message',
    behavior,
    role,
    prompt,
    join: 'all',
    ports: [
      ...(behavior === 'review'
        ? [{ id: 'in', direction: 'input' as const, schema: 'message.v1' as const, required: true }]
        : []),
      { id: 'out', direction: 'output', schema: 'message.v1', required: false },
    ],
  })
  return validateGraph({
    schemaVersion: 1,
    scope,
    revision: 1,
    name,
    nodes: [
      node('GG', 'produce', copy.roles[0], copy.prompts[0]),
      node('Dev', 'review', copy.roles[1], copy.prompts[1]),
      node('Auditor', 'review', copy.roles[2], copy.prompts[2]),
    ],
    controlEdges: [
      { id: 'control_gg_dev', kind: 'control', from: 'GG', to: 'Dev' },
      { id: 'control_dev_qa', kind: 'control', from: 'Dev', to: 'Auditor' },
    ],
    dataEdges: [
      {
        id: 'data_gg_dev',
        kind: 'data',
        from: { nodeId: 'GG', portId: 'out' },
        to: { nodeId: 'Dev', portId: 'in' },
      },
      {
        id: 'data_dev_qa',
        kind: 'data',
        from: { nodeId: 'Dev', portId: 'out' },
        to: { nodeId: 'Auditor', portId: 'in' },
      },
    ],
    budget: { known: true, maxSteps: 32, maxRetries: 2, maxMessageChars: 8192, maxTicks: 256 },
  })
}
export function initialLayout(): Layout {
  return { GG: { x: 70, y: 160 }, Dev: { x: 380, y: 160 }, Auditor: { x: 690, y: 160 } }
}
export function initialLabels(): Readonly<Record<string, NodeLabel>> {
  return {
    GG: { label: 'GG', kind: 'manager' },
    Dev: { label: 'Dev', kind: 'worker' },
    Auditor: { label: 'Auditor', kind: 'reviewer' },
  }
}
export function fakeRequest(graph: GraphDocument, serial: number): FakeRunInput {
  const plan = compileGraph(graph)
  return immutable({
    identity: {
      runId: `demo_run_${serial}`,
      correlationId: `demo_correlation_${serial}`,
      scope: plan.graph.scope,
      graphDigest: plan.graphDigest,
      revision: plan.graph.revision,
    },
    nowTick: 0,
  })
}
export function approveFake(
  input: FakeRunInput,
  result: FakeRunResult,
  decision: 'approved' | 'denied',
): FakeRunInput {
  return immutable({
    ...input,
    checkpoint: result.checkpoint,
    resume: true,
    grant: {
      mode: 'SIMULATION_ONLY',
      realAccess: false,
      identity: input.identity,
      decision,
      action: 'fake.handoff',
      issuedAtTick: 0,
      expiresAtTick: 1000,
    },
  })
}
/** Views replay captured M1 events; they never pretend a provider is running. */
export function runProjection(run: UiRun | null): {
  status: Status
  nodes: Readonly<Record<string, Status>>
  visibleOutputs: string[]
} {
  if (!run) return { status: 'queued', nodes: {}, visibleOutputs: [] }
  const events = run.result.checkpoint.events.slice(0, run.playhead),
    nodes: Record<string, Status> = {}
  for (const event of events) if (event.nodeId) nodes[event.nodeId] = event.status
  const status = events[events.length - 1]?.status ?? 'queued'
  return {
    status,
    nodes,
    visibleOutputs: run.result.checkpoint.receipts
      .filter((r) => nodes[r.message.nodeId] === 'succeeded')
      .map((r) => r.message.content),
  }
}
export function connectDraft(
  graph: GraphDocument,
  from: string,
  to: string,
  serial: number,
  targetPort = 'in',
): GraphDocument {
  const draft = JSON.parse(JSON.stringify(graph)) as {
    -readonly [K in keyof GraphDocument]: GraphDocument[K]
  }
  const source = draft.nodes.find((n) => n.id === from),
    target = draft.nodes.find((n) => n.id === to)
  if (!source || !target) throw new Error('DANGLING_REF')
  let port = targetPort
  if (port === 'new') {
    let n = 1
    while (target.ports.some((p) => p.id === `in_${n}`)) n++
    port = `in_${n}`
  }
  if (!target.ports.some((p) => p.id === port))
    draft.nodes = draft.nodes.map((n) =>
      n.id === to
        ? {
            ...n,
            ports: [
              ...n.ports,
              { id: port, direction: 'input', schema: 'message.v1', required: true },
            ],
          }
        : n,
    )
  const control = draft.controlEdges.some((e) => e.from === from && e.to === to)
    ? draft.controlEdges
    : [...draft.controlEdges, { id: `control_${serial}`, kind: 'control' as const, from, to }]
  const data = [
    ...draft.dataEdges,
    {
      id: `data_${serial}`,
      kind: 'data' as const,
      from: { nodeId: from, portId: source.ports.find((p) => p.direction === 'output')!.id },
      to: { nodeId: to, portId: port },
    },
  ]
  return validateGraph({
    ...draft,
    revision: graph.revision + 1,
    controlEdges: control,
    dataEdges: data,
  })
}
