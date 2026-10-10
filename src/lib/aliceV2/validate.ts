import {
  DomainError,
  type FakeGrant,
  type GraphDocument,
  immutable,
  type Message,
  type RunIdentity,
  type Scope,
} from './contracts'

const RESERVED = new Set(['__proto__', 'prototype', 'constructor'])
const SECRET =
  /^(password|token|apiKey|secret|secretValue|credentials?|authorization|access_token|refresh_token|ptyId|command|script|endpoint|webhook|url)$/i
export function record(
  value: unknown,
  keys: readonly string[],
  path: string,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new DomainError('MALFORMED', path)
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Object.getOwnPropertySymbols(value).length) throw new DomainError('MALFORMED', path)
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!('value' in descriptor) || !descriptor.enumerable) throw new DomainError('MALFORMED', path)
    if (SECRET.test(key) || RESERVED.has(key)) throw new DomainError('SECRET_FIELD', path)
    if (!keys.includes(key)) throw new DomainError('UNKNOWN_FIELD', `${path}.${key}`)
  }
  return value as Record<string, unknown>
}
export function id(value: unknown, path: string): string {
  if (
    typeof value !== 'string' ||
    !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(value) ||
    RESERVED.has(value)
  )
    throw new DomainError('UNSAFE_ID', path)
  return value
}
export function integer(value: unknown, min: number, max: number, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max)
    throw new DomainError('MALFORMED', path)
  return value as number
}
function text(value: unknown, max: number, path: string): string {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  )
    throw new DomainError('MALFORMED', path)
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = value.charCodeAt(++i)
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new DomainError('MALFORMED', path)
    } else if (c >= 0xdc00 && c <= 0xdfff) throw new DomainError('MALFORMED', path)
  }
  return value
}
export function list(value: unknown, max: number, path: string): unknown[] {
  if (
    !Array.isArray(value) ||
    value.length > max ||
    Object.keys(value).length !== value.length ||
    Object.getOwnPropertyNames(value).length !== value.length + 1 ||
    Object.getOwnPropertySymbols(value).length > 0 ||
    Object.getPrototypeOf(value) !== Array.prototype
  )
    throw new DomainError('MALFORMED', path)
  for (let i = 0; i < value.length; i++)
    if (
      !Object.prototype.hasOwnProperty.call(
        Object.getOwnPropertyDescriptor(value, String(i)) ?? {},
        'value',
      )
    )
      throw new DomainError('MALFORMED', path)
  return value
}
export function scope(value: unknown, path: string): Scope {
  const r = record(value, ['ownerId', 'profileId', 'configId'], path)
  return {
    ownerId: id(r.ownerId, path),
    profileId: id(r.profileId, path),
    configId: id(r.configId, path),
  }
}
export function sameScope(a: Scope, b: Scope): boolean {
  return a.ownerId === b.ownerId && a.profileId === b.profileId && a.configId === b.configId
}
export function identity(value: unknown): RunIdentity {
  const r = record(
    value,
    ['runId', 'correlationId', 'scope', 'graphDigest', 'revision'],
    'identity',
  )
  if (typeof r.graphDigest !== 'string' || !/^[a-f0-9]{64}$/.test(r.graphDigest))
    throw new DomainError('SNAPSHOT_MISMATCH', 'identity.digest')
  return {
    runId: id(r.runId, 'run'),
    correlationId: id(r.correlationId, 'correlation'),
    scope: scope(r.scope, 'identity.scope'),
    graphDigest: r.graphDigest,
    revision: integer(r.revision, 1, 1_000_000, 'revision'),
  }
}
export function sameIdentity(a: RunIdentity, b: RunIdentity): boolean {
  return (
    a.runId === b.runId &&
    a.correlationId === b.correlationId &&
    sameScope(a.scope, b.scope) &&
    a.graphDigest === b.graphDigest &&
    a.revision === b.revision
  )
}
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
export function validateGraph(input: unknown): GraphDocument {
  const r = record(
    input,
    ['schemaVersion', 'scope', 'revision', 'name', 'nodes', 'controlEdges', 'dataEdges', 'budget'],
    'graph',
  )
  if (r.schemaVersion !== 1) throw new DomainError('SCHEMA_VERSION', 'graph')
  const owner = scope(r.scope, 'graph.scope'),
    revision = integer(r.revision, 1, 1_000_000, 'revision')
  const name = text(r.name, 120, 'name')
  if (!name.trim()) throw new DomainError('MALFORMED', 'name')
  const b = record(
    r.budget,
    ['known', 'maxSteps', 'maxRetries', 'maxMessageChars', 'maxTicks'],
    'budget',
  )
  if (b.known !== true) throw new DomainError('UNKNOWN_BUDGET', 'budget')
  let budget: GraphDocument['budget']
  try {
    budget = {
      known: true,
      maxSteps: integer(b.maxSteps, 1, 1024, 'steps'),
      maxRetries: integer(b.maxRetries, 0, 8, 'retries'),
      maxMessageChars: integer(b.maxMessageChars, 1, 16_384, 'message'),
      maxTicks: integer(b.maxTicks, 1, 8192, 'ticks'),
    }
  } catch {
    throw new DomainError('INVALID_BUDGET', 'budget')
  }
  const nodes = list(r.nodes, 64, 'nodes')
    .map((value) => {
      const n = record(
        value,
        [
          'id',
          'kind',
          'scope',
          'provider',
          'capability',
          'behavior',
          'role',
          'prompt',
          'join',
          'ports',
        ],
        'node',
      )
      if (n.kind !== 'agent' || n.provider !== 'fake' || n.capability !== 'fake.message')
        throw new DomainError('UNSUPPORTED_PROVIDER', 'node')
      if (n.behavior !== 'produce' && n.behavior !== 'review')
        throw new DomainError('MALFORMED', 'behavior')
      if (n.join !== 'all') throw new DomainError('IMPOSSIBLE_JOIN', 'join')
      const nodeScope = scope(n.scope, 'node.scope')
      if (!sameScope(owner, nodeScope)) throw new DomainError('OWNER_SCOPE', 'node')
      const ports = list(n.ports, 8, 'ports')
        .map((value) => {
          const p = record(value, ['id', 'direction', 'schema', 'required'], 'port')
          if (p.schema !== 'message.v1') throw new DomainError('PORT_SCHEMA', 'port')
          if (
            !['input', 'output'].includes(p.direction as string) ||
            typeof p.required !== 'boolean' ||
            (p.direction === 'output' && p.required)
          )
            throw new DomainError('PORT_DIRECTION', 'port')
          return {
            id: id(p.id, 'port'),
            direction: p.direction as 'input' | 'output',
            schema: 'message.v1' as const,
            required: p.required,
          }
        })
        .sort((a, b) => compare(a.id, b.id))
      if (new Set(ports.map((p) => p.id)).size !== ports.length)
        throw new DomainError('DUPLICATE_ID', 'ports')
      if (ports.filter((p) => p.direction === 'output').length !== 1)
        throw new DomainError('PORT_DIRECTION', 'outputs')
      return {
        id: id(n.id, 'node'),
        kind: 'agent' as const,
        scope: nodeScope,
        provider: 'fake' as const,
        capability: 'fake.message' as const,
        behavior: n.behavior as 'produce' | 'review',
        role: text(n.role, 80, 'role'),
        prompt: text(n.prompt, 4096, 'prompt'),
        join: 'all' as const,
        ports,
      }
    })
    .sort((a, b) => compare(a.id, b.id))
  if (!nodes.length) throw new DomainError('MALFORMED', 'nodes')
  const controlEdges = list(r.controlEdges, 256, 'controlEdges')
    .map((value) => {
      const e = record(value, ['id', 'kind', 'from', 'to'], 'control')
      if (e.kind !== 'control') throw new DomainError('MALFORMED', 'control')
      return {
        id: id(e.id, 'edge'),
        kind: 'control' as const,
        from: id(e.from, 'from'),
        to: id(e.to, 'to'),
      }
    })
    .sort((a, b) => compare(a.id, b.id))
  const endpoint = (value: unknown) => {
    const p = record(value, ['nodeId', 'portId'], 'endpoint')
    return { nodeId: id(p.nodeId, 'endpoint'), portId: id(p.portId, 'endpoint') }
  }
  const dataEdges = list(r.dataEdges, 256, 'dataEdges')
    .map((value) => {
      const e = record(value, ['id', 'kind', 'from', 'to'], 'data')
      if (e.kind !== 'data') throw new DomainError('MALFORMED', 'data')
      return {
        id: id(e.id, 'edge'),
        kind: 'data' as const,
        from: endpoint(e.from),
        to: endpoint(e.to),
      }
    })
    .sort((a, b) => compare(a.id, b.id))
  const ids = [
    ...nodes.map((n) => n.id),
    ...controlEdges.map((e) => e.id),
    ...dataEdges.map((e) => e.id),
  ]
  if (new Set(ids).size !== ids.length) throw new DomainError('DUPLICATE_ID', 'graph')
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const pairs = controlEdges.map((e) => `${e.from}:${e.to}`)
  if (new Set(pairs).size !== pairs.length) throw new DomainError('DUPLICATE_ID', 'control')
  for (const e of controlEdges)
    if (!byId.has(e.from) || !byId.has(e.to)) throw new DomainError('DANGLING_REF', 'control')
  const visit = (node: string, active: Set<string>, done: Set<string>): void => {
    if (active.has(node)) throw new DomainError('CYCLE', 'control')
    if (done.has(node)) return
    active.add(node)
    controlEdges.filter((e) => e.from === node).forEach((e) => visit(e.to, active, done))
    active.delete(node)
    done.add(node)
  }
  const done = new Set<string>()
  nodes.forEach((n) => visit(n.id, new Set(), done))
  const reaches = (from: string, to: string): boolean => {
    const queue = [from],
      visited = new Set<string>()
    while (queue.length) {
      const next = queue.shift()!
      if (visited.has(next)) continue
      visited.add(next)
      for (const e of controlEdges.filter((e) => e.from === next)) {
        if (e.to === to) return true
        queue.push(e.to)
      }
    }
    return false
  }
  const targets = new Set<string>()
  for (const e of dataEdges) {
    const from = byId.get(e.from.nodeId)?.ports.find((p) => p.id === e.from.portId),
      to = byId.get(e.to.nodeId)?.ports.find((p) => p.id === e.to.portId)
    if (!from || !to) throw new DomainError('DANGLING_REF', 'data')
    if (from.direction !== 'output' || to.direction !== 'input')
      throw new DomainError('PORT_DIRECTION', 'data')
    if (!reaches(e.from.nodeId, e.to.nodeId))
      throw new DomainError('IMPOSSIBLE_JOIN', 'data.dependency')
    const key = `${e.to.nodeId}:${e.to.portId}`
    if (targets.has(key)) throw new DomainError('IMPOSSIBLE_JOIN', 'data.input')
    targets.add(key)
  }
  for (const n of nodes)
    for (const p of n.ports)
      if (p.direction === 'input' && p.required && !targets.has(`${n.id}:${p.id}`))
        throw new DomainError('MISSING_INPUT', n.id)
  if (budget.maxSteps < nodes.length || budget.maxTicks < nodes.length + 1)
    throw new DomainError('INVALID_BUDGET', 'steps.or.ticks')
  return immutable({
    schemaVersion: 1,
    scope: owner,
    revision,
    name,
    nodes,
    controlEdges,
    dataEdges,
    budget,
  })
}
export function importGraph(json: string): GraphDocument {
  if (typeof json !== 'string' || json.length > 256_000)
    throw new DomainError('MALFORMED', 'import')
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw new DomainError('MALFORMED', 'import')
  }
  return validateGraph(value)
}
export function exportGraph(graph: unknown): string {
  return JSON.stringify(validateGraph(graph))
}
export function validateGrant(input: unknown, expected: RunIdentity, tick: number): FakeGrant {
  const g = record(
    input,
    ['mode', 'realAccess', 'identity', 'decision', 'action', 'issuedAtTick', 'expiresAtTick'],
    'grant',
  )
  if (
    g.mode !== 'SIMULATION_ONLY' ||
    g.realAccess !== false ||
    g.action !== 'fake.handoff' ||
    !sameIdentity(identity(g.identity), expected)
  )
    throw new DomainError('GRANT_MISMATCH', 'grant')
  if (g.decision !== 'approved' && g.decision !== 'denied')
    throw new DomainError('GRANT_MISMATCH', 'grant.decision')
  if (g.decision === 'denied') throw new DomainError('GRANT_DENIED', 'grant')
  const issued = integer(g.issuedAtTick, 0, 1_000_000, 'issued'),
    expires = integer(g.expiresAtTick, 0, 1_000_000, 'expires')
  if (issued > tick || expires <= tick || expires <= issued)
    throw new DomainError('GRANT_EXPIRED', 'grant')
  return immutable(g as unknown as FakeGrant)
}
export function validateOutput(
  input: unknown,
  expected: RunIdentity,
  nodeId: string,
  sessionId: string,
  maxChars: number,
): Message {
  try {
    const m = record(
      input,
      ['schemaVersion', 'kind', 'identity', 'nodeId', 'sessionId', 'content'],
      'output',
    )
    if (
      m.schemaVersion !== 1 ||
      m.kind !== 'message' ||
      !sameIdentity(identity(m.identity), expected) ||
      m.nodeId !== nodeId ||
      m.sessionId !== sessionId
    )
      throw new DomainError('UNTRUSTED_OUTPUT', 'binding')
    text(m.content, maxChars, 'output.content')
    return immutable(m as unknown as Message)
  } catch {
    throw new DomainError('UNTRUSTED_OUTPUT', 'output')
  }
}
