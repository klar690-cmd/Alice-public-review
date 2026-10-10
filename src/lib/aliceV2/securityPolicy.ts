/** Offline policy evaluation only. Authority facts must come from a future trusted broker. */
export type Provider = 'codex' | 'claude'
export type RuntimeMode = 'local-app-server' | 'local-cli-json'
export type Action = 'start' | 'resume' | 'steer' | 'cancel' | 'status' | 'artifacts'
export type Tool = 'read' | 'write' | 'test'
export type CodexPolicy = Readonly<{
  approval: 'on-request' | 'never'
  sandbox: 'read-only' | 'workspace-write'
}>
export type Scope = Readonly<{
  projectId: string
  graphRevision: number
  nodeId: string
  runId: string
  attemptId: string
  provider: Provider
  mode: RuntimeMode
}>
export type OfflineGrant = Scope &
  Readonly<{
    kind: 'ALICE_OFFLINE_GRANT_V1'
    grantId: string
    workspaceRoot: string
    action: Action
    tools: readonly Tool[]
    policy: CodexPolicy
    authRef: string
    sessionRef: string | null
    startsAtMs: number
    expiresAtMs: number
    nonce: string
    approvalRef: string
    reservationId: string
    budgetUnits: number
  }>
export type OfflineRequest = Scope &
  Readonly<{
    kind: 'ALICE_OFFLINE_REQUEST_V1'
    action: Action
    tools: readonly Tool[]
    policy: CodexPolicy
    authRef: string
    sessionRef: string | null
    cwd: string
    costUnits: number
  }>
export type AuthorityFacts = Readonly<{
  kind: 'ALICE_OFFLINE_FACTS_V1'
  nowMs: number
  workspaceRoot: string
  canonicalRoot: string
  canonicalCwd: string
  auth: Readonly<{ projectId: string; provider: Provider; mode: RuntimeMode; authRef: string }>
  approvedGrant: Readonly<{ grantId: string; nonce: string; approvalRef: string }>
  reservation: Readonly<{ projectId: string; reservationId: string; remainingUnits: number | null }>
  spentNonces: readonly string[]
}>
export type OfflineDecision = Readonly<{
  code: string
  executable: false
  nextSpentNonces?: readonly string[]
}>

export class PolicyError extends Error {
  constructor(public readonly code: string) {
    super(code)
  }
}

function fail(code: string): never {
  throw new PolicyError(code)
}
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/
const scopeKeys = ['projectId', 'graphRevision', 'nodeId', 'runId', 'attemptId', 'provider', 'mode']
const grantKeys = [
  ...scopeKeys,
  'kind',
  'grantId',
  'workspaceRoot',
  'action',
  'tools',
  'policy',
  'authRef',
  'sessionRef',
  'startsAtMs',
  'expiresAtMs',
  'nonce',
  'approvalRef',
  'reservationId',
  'budgetUnits',
]
const requestKeys = [
  ...scopeKeys,
  'kind',
  'action',
  'tools',
  'policy',
  'authRef',
  'sessionRef',
  'cwd',
  'costUnits',
]

export function rejectSecretMaterial(value: unknown, depth = 0): void {
  if (depth > 12) fail('MALFORMED')
  if (
    typeof value === 'string' &&
    /sk-[a-zA-Z0-9]|bearer\s|-----BEGIN|refresh_token|access_token/i.test(value)
  )
    fail('SECRET_MATERIAL')
  if (Array.isArray(value)) {
    if (value.length > 128) fail('MALFORMED')
    value.forEach((item) => rejectSecretMaterial(item, depth + 1))
  } else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (/token|password|secret|oauth|credential|cookie|api.?key/i.test(key))
        fail('SECRET_MATERIAL')
      rejectSecretMaterial(item, depth + 1)
    }
  }
}

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('MALFORMED')
  const result = value as Record<string, unknown>
  if (
    Object.keys(result).length !== keys.length ||
    Object.keys(result).some((key) => !keys.includes(key))
  )
    fail('MALFORMED')
  return result
}
function id(value: unknown): void {
  if (typeof value !== 'string' || !idPattern.test(value)) fail('MALFORMED')
}
function units(value: unknown): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail('MALFORMED')
}
function authRef(value: unknown): void {
  if (typeof value !== 'string' || !/^authref:[a-z0-9][a-z0-9_-]{0,63}$/.test(value))
    fail('AUTH_MISMATCH')
}
function scope(value: Record<string, unknown>): void {
  for (const key of ['projectId', 'nodeId', 'runId', 'attemptId']) id(value[key])
  units(value.graphRevision)
  if (!['codex', 'claude'].includes(String(value.provider))) fail('UNKNOWN_PROVIDER')
  if (!['local-app-server', 'local-cli-json'].includes(String(value.mode))) fail('UNKNOWN_MODE')
  if ((value.provider === 'codex') !== (value.mode === 'local-app-server')) fail('UNKNOWN_MODE')
}
function operation(value: Record<string, unknown>): void {
  if (!['start', 'resume', 'steer', 'cancel', 'status', 'artifacts'].includes(String(value.action)))
    fail('UNKNOWN_ACTION')
  if (
    !Array.isArray(value.tools) ||
    value.tools.length > 3 ||
    new Set(value.tools).size !== value.tools.length ||
    value.tools.some((tool) => !['read', 'write', 'test'].includes(String(tool)))
  )
    fail('UNKNOWN_TOOL')
  object(value.policy, ['approval', 'sandbox'])
  const policy = value.policy as Record<string, unknown>
  if (
    !['on-request', 'never'].includes(String(policy.approval)) ||
    !['read-only', 'workspace-write'].includes(String(policy.sandbox))
  )
    fail('UNKNOWN_POLICY')
  if (policy.sandbox === 'workspace-write' && policy.approval === 'never') fail('UNSAFE_POLICY')
  if (policy.sandbox === 'read-only' && value.tools.includes('write')) fail('READ_ONLY')
  authRef(value.authRef)
  if (value.sessionRef !== null) id(value.sessionRef)
  if (value.action !== 'start' && value.sessionRef === null) fail('SESSION_REQUIRED')
}

/** Conservative Windows path representation; no filesystem access or symlink resolution. */
export function normalizedWorkspacePath(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z]:[\\/]/.test(value)) fail('WORKSPACE_ESCAPE')
  const path = value.split('\\').join('/').toLowerCase()
  const segments = path.slice(3).split('/')
  if (
    !segments.length ||
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        !/^[a-z0-9 _.-]+$/.test(segment) ||
        /[ .]$/.test(segment) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/.test(segment),
    )
  )
    fail('WORKSPACE_ESCAPE')
  return path
}
function within(path: string, root: string): boolean {
  return path === root || path.startsWith(root + '/')
}

export function parseOfflineRequest(value: unknown): OfflineRequest {
  rejectSecretMaterial(value)
  const r = object(value, requestKeys)
  if (r.kind !== 'ALICE_OFFLINE_REQUEST_V1') fail('MALFORMED')
  scope(r)
  operation(r)
  units(r.costUnits)
  normalizedWorkspacePath(r.cwd)
  return structuredClone(r) as unknown as OfflineRequest
}

export function evaluateOfflineGrant(
  grant: unknown,
  request: unknown,
  facts: unknown,
): OfflineDecision {
  const denied = (code: string): OfflineDecision => Object.freeze({ code, executable: false })
  if (grant === null || grant === undefined) return denied('NO_GRANT')
  try {
    rejectSecretMaterial(grant)
    rejectSecretMaterial(facts)
    const g = object(grant, grantKeys)
    if (g.kind !== 'ALICE_OFFLINE_GRANT_V1') fail('MALFORMED')
    scope(g)
    operation(g)
    for (const key of ['grantId', 'nonce', 'approvalRef', 'reservationId']) id(g[key])
    for (const key of ['startsAtMs', 'expiresAtMs', 'budgetUnits']) units(g[key])
    const r = parseOfflineRequest(request)
    const f = object(facts, [
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
    if (f.kind !== 'ALICE_OFFLINE_FACTS_V1') fail('MALFORMED')
    units(f.nowMs)
    const a = object(f.auth, ['projectId', 'provider', 'mode', 'authRef'])
    const proof = object(f.approvedGrant, ['grantId', 'nonce', 'approvalRef'])
    const budget = object(f.reservation, ['projectId', 'reservationId', 'remainingUnits'])
    if (!Array.isArray(f.spentNonces) || f.spentNonces.length > 128) fail('MALFORMED')
    f.spentNonces.forEach(id)
    for (const key of scopeKeys)
      if (g[key] !== r[key as keyof OfflineRequest])
        fail(key === 'graphRevision' ? 'STALE_GRAPH' : 'SCOPE_MISMATCH')
    if (g.action !== r.action || r.tools.some((tool) => !(g.tools as Tool[]).includes(tool)))
      fail('CAPABILITY_MISMATCH')
    const p = g.policy as CodexPolicy
    if (p.approval !== r.policy.approval || p.sandbox !== r.policy.sandbox) fail('POLICY_MISMATCH')
    if (
      g.authRef !== r.authRef ||
      g.sessionRef !== r.sessionRef ||
      a.authRef !== g.authRef ||
      a.projectId !== g.projectId ||
      a.provider !== g.provider ||
      a.mode !== g.mode
    )
      fail('AUTH_MISMATCH')
    if (
      proof.grantId !== g.grantId ||
      proof.nonce !== g.nonce ||
      proof.approvalRef !== g.approvalRef
    )
      fail('APPROVAL_REQUIRED')
    if (
      (f.nowMs as number) < (g.startsAtMs as number) ||
      (f.nowMs as number) >= (g.expiresAtMs as number) ||
      (g.startsAtMs as number) >= (g.expiresAtMs as number)
    )
      fail('EXPIRED_GRANT')
    if (f.spentNonces.includes(g.nonce)) fail('REPLAYED_GRANT')
    const root = normalizedWorkspacePath(g.workspaceRoot),
      logicalRoot = normalizedWorkspacePath(f.workspaceRoot),
      canonicalRoot = normalizedWorkspacePath(f.canonicalRoot)
    const cwd = normalizedWorkspacePath(r.cwd),
      canonicalCwd = normalizedWorkspacePath(f.canonicalCwd)
    if (
      root !== logicalRoot ||
      root !== canonicalRoot ||
      !within(cwd, root) ||
      !within(canonicalCwd, root)
    )
      fail('WORKSPACE_ESCAPE')
    if (cwd !== canonicalCwd) fail('PATH_ALIAS')
    if (budget.remainingUnits === null) fail('UNKNOWN_BUDGET')
    units(budget.remainingUnits)
    if (
      budget.projectId !== g.projectId ||
      budget.reservationId !== g.reservationId ||
      (g.budgetUnits as number) <= 0 ||
      (g.budgetUnits as number) > (budget.remainingUnits as number) ||
      r.costUnits > (g.budgetUnits as number)
    )
      fail('BUDGET_EXCEEDED')
    if (g.provider === 'claude') fail('BLOCKED_UNSUPPORTED_CLAUDE_PERMISSION_CHANNEL')
    return Object.freeze({
      code: 'ELIGIBLE_OFFLINE',
      executable: false,
      nextSpentNonces: Object.freeze([...f.spentNonces, g.nonce as string]),
    })
  } catch (error) {
    return denied(error instanceof PolicyError ? error.code : 'MALFORMED')
  }
}

/** Mock protocol serializer; never calls native IPC or starts a process. */
export function codexTurnFixture(policy: CodexPolicy, cwd: string, threadId: string, text: string) {
  const root = normalizedWorkspacePath(cwd)
  if (
    !['on-request', 'never'].includes(policy.approval) ||
    !['read-only', 'workspace-write'].includes(policy.sandbox)
  )
    fail('UNKNOWN_POLICY')
  return Object.freeze({
    threadId,
    input: [{ type: 'text', text }],
    approvalPolicy: policy.approval,
    sandboxPolicy:
      policy.sandbox === 'read-only'
        ? { type: 'readOnly' }
        : {
            type: 'workspaceWrite',
            writableRoots: [root],
            networkAccess: false,
            excludeTmpdirEnvVar: true,
            excludeSlashTmp: true,
          },
  })
}
