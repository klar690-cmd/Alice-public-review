import {
  defaultProviderSelection,
  methodCapability,
  type ProviderUiSelection,
  type ProviderUiStatus,
  type UiScope,
  validateProviderSelection,
} from './providerUiOptions'
import { PolicyError, rejectSecretMaterial } from './securityPolicy'

export type IntentRole = 'manager' | 'worker' | 'reviewer'
export type IntentContext = Readonly<{
  scope: UiScope
  role: IntentRole
  graphSchemaVersion: 1
  graphRevision: number
  previousSequence: number
  spentIntentIds: readonly string[]
}>
export type IntentRequest = Readonly<{
  schemaVersion: 1
  scope: UiScope
  graphSchemaVersion: 1
  graphRevision: number
  intentId: string
  sequence: number
}>
export const INTENT_DENIALS = [
  'MALFORMED',
  'SECRET_MATERIAL',
  'INVALID_PROVIDER_SELECTION',
  'INVALID_UI_SCOPE',
  'FOREIGN_UI_SCOPE',
  'REAL_ACCESS_NOT_ALLOWED',
  'INVALID_CONTEXT',
  'STALE_GRAPH_REVISION',
  'REPLAYED_INTENT',
  'CLAUDE_STRUCTURED_BLOCKED',
  'ACCOUNT_METHOD_UNAVAILABLE',
  'METHOD_UNAVAILABLE',
  'SIMULATION_ONLY',
  'NATIVE_QA_NOT_VERIFIED',
  'INTEGRATION_NOT_IMPLEMENTED',
  'PROVIDER_NOT_CONNECTED',
  'TRUSTED_PROJECT_GRANT_MISSING',
  'EXPLICIT_USER_APPROVAL_REQUIRED',
  'NO_REAL_PERMISSIONS',
  'NO_PAID_USAGE_AUTHORIZED',
  'N8N_NOT_CONNECTED',
] as const
export type IntentDenial = (typeof INTENT_DENIALS)[number]
const guards = {
  executable: false,
  connectionVerified: false,
  nativeQAGate: 'BLOCKED_OR_NOT_VERIFIED',
  requiresExplicitUserApproval: true,
  providerCallAuthorization: 'NONE',
  n8nDeployable: false,
} as const
export type RunRequirements = Readonly<
  typeof guards & {
    decision: 'DENY'
    capabilityStatus: ProviderUiStatus | 'UNKNOWN'
    gate: 'SIMULATION_ONLY' | 'BLOCKED_NATIVE_QA' | 'NOT_CONNECTED'
    denialReasons: readonly IntentDenial[]
  }
>
export type AgentRunIntent = Readonly<
  RunRequirements & {
    format: 'alice.agent-run-intent.v1'
    mode: 'PREPARATION_ONLY'
    provenance: 'LOCAL_UI_PREFERENCE_NOT_AUTHORITY'
    preparation: 'PREPARED_OFFLINE_NOT_EXECUTABLE' | 'REJECTED'
    intent: Readonly<{
      schemaVersion: 1
      scope: UiScope
      role: IntentRole
      graphSchemaVersion: 1
      graphRevision: number
      intentId: string
      sequence: number
      providerId: ProviderUiSelection['providerId']
      method: ProviderUiSelection['method']
      model: 'provider-default'
      workspace: 'simulation-only'
      permissions: 'no-real-access'
      budget: 'no-paid-use'
    }> | null
  }
>
const common: readonly IntentDenial[] = [
  'NATIVE_QA_NOT_VERIFIED',
  'INTEGRATION_NOT_IMPLEMENTED',
  'PROVIDER_NOT_CONNECTED',
  'TRUSTED_PROJECT_GRANT_MISSING',
  'EXPLICIT_USER_APPROVAL_REQUIRED',
  'NO_REAL_PERMISSIONS',
  'NO_PAID_USAGE_AUTHORIZED',
  'N8N_NOT_CONNECTED',
]
function fail(code: IntentDenial): never {
  throw new PolicyError(code)
}
/** Accept bounded data only; getters, prototypes and error text are never echoed. */
function data(value: unknown, depth = 0): void {
  if (depth > 8) fail('MALFORMED')
  if (typeof value === 'string' && value.length > 512) fail('MALFORMED')
  if (value === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof value)) return
  if (typeof value !== 'object') fail('MALFORMED')
  const array = Array.isArray(value),
    proto = Object.getPrototypeOf(value)
  if (!array && proto !== Object.prototype && proto !== null) fail('MALFORMED')
  const keys = Reflect.ownKeys(value as object)
  if (keys.length > (array ? 129 : 32)) fail('MALFORMED')
  for (const key of keys) {
    if (typeof key !== 'string') fail('MALFORMED')
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!
    if (!('value' in descriptor)) fail('MALFORMED')
    data(descriptor.value, depth + 1)
  }
}
function safe(value: unknown): void {
  data(value)
  rejectSecretMaterial(value)
}
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('MALFORMED')
  const result = value as Record<string, unknown>
  if (
    Object.keys(result).length !== keys.length ||
    Object.keys(result).some((k) => !keys.includes(k))
  )
    fail('MALFORMED')
  return result
}
function sequence(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
}
function id(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(value) &&
    !['constructor', 'prototype', '__proto__'].includes(value)
  )
}
function errorCode(error: unknown): IntentDenial {
  return error instanceof PolicyError && INTENT_DENIALS.includes(error.code as IntentDenial)
    ? (error.code as IntentDenial)
    : 'MALFORMED'
}
function requirements(
  status: RunRequirements['capabilityStatus'],
  reasons: readonly IntentDenial[],
): RunRequirements {
  return Object.freeze({
    ...guards,
    decision: 'DENY',
    capabilityStatus: status,
    gate:
      status === 'SIMULATED'
        ? 'SIMULATION_ONLY'
        : status === 'NATIVE_QA_PENDING'
          ? 'BLOCKED_NATIVE_QA'
          : 'NOT_CONNECTED',
    denialReasons: Object.freeze([...new Set([...reasons, ...common])]),
  })
}
function selection(value: unknown, expected?: UiScope): ProviderUiSelection {
  safe(value)
  const s = object(value, [
    'schemaVersion',
    'scope',
    'providerId',
    'method',
    'model',
    'workspace',
    'permissions',
    'budget',
    'connected',
    'executable',
  ])
  const scope = defaultProviderSelection(s.scope as UiScope).scope
  // Validate shape/scope/access before classifying an unavailable method.
  const validated = validateProviderSelection({ ...s, method: 'simulated' }, expected ?? scope)
  const capability = methodCapability(
    validated.providerId,
    s.method as ProviderUiSelection['method'],
  )
  if (!capability.selectable)
    fail(
      capability.reason === 'claudeBlocked'
        ? 'CLAUDE_STRUCTURED_BLOCKED'
        : capability.reason === 'accountApproval'
          ? 'ACCOUNT_METHOD_UNAVAILABLE'
          : 'METHOD_UNAVAILABLE',
    )
  return validateProviderSelection(value, expected ?? scope)
}
function describe(s: ProviderUiSelection): RunRequirements {
  const capability = methodCapability(s.providerId, s.method)
  return requirements(capability.status, [
    ...(s.method === 'simulated' ? ['SIMULATION_ONLY' as const] : []),
    ...(s.providerId === 'claude' ? ['CLAUDE_STRUCTURED_BLOCKED' as const] : []),
  ])
}
/** Inspector facts only: graph freshness and replay are not verified by this view. */
export function inspectRunRequirements(value: unknown): RunRequirements {
  try {
    return describe(selection(value))
  } catch (error) {
    return requirements('UNKNOWN', [errorCode(error)])
  }
}
/** Pure snapshot comparison. The caller's ledger/context is not a trusted native grant. */
export function prepareAgentRunIntent(
  value: unknown,
  boundary: unknown,
  request: unknown,
): AgentRunIntent {
  const base = {
    format: 'alice.agent-run-intent.v1',
    mode: 'PREPARATION_ONLY',
    provenance: 'LOCAL_UI_PREFERENCE_NOT_AUTHORITY',
  } as const
  try {
    safe(boundary)
    safe(request)
    const c = object(boundary, [
      'scope',
      'role',
      'graphSchemaVersion',
      'graphRevision',
      'previousSequence',
      'spentIntentIds',
    ])
    if (
      !['manager', 'worker', 'reviewer'].includes(c.role as string) ||
      c.graphSchemaVersion !== 1 ||
      !sequence(c.graphRevision, 1) ||
      !sequence(c.previousSequence, 0) ||
      !Array.isArray(c.spentIntentIds) ||
      c.spentIntentIds.some((v) => !id(v))
    )
      fail('INVALID_CONTEXT')
    const expected = defaultProviderSelection(c.scope as UiScope).scope,
      s = selection(value, expected),
      r = object(request, [
        'schemaVersion',
        'scope',
        'graphSchemaVersion',
        'graphRevision',
        'intentId',
        'sequence',
      ])
    if (
      r.schemaVersion !== 1 ||
      r.graphSchemaVersion !== 1 ||
      !sequence(r.graphRevision, 1) ||
      !sequence(r.sequence, 1) ||
      !id(r.intentId)
    )
      fail('MALFORMED')
    const requestScope = defaultProviderSelection(r.scope as UiScope).scope
    if (
      Object.keys(expected).some(
        (k) => expected[k as keyof UiScope] !== requestScope[k as keyof UiScope],
      )
    )
      fail('FOREIGN_UI_SCOPE')
    if (r.graphRevision !== c.graphRevision) fail('STALE_GRAPH_REVISION')
    if (r.sequence <= c.previousSequence || c.spentIntentIds.includes(r.intentId))
      fail('REPLAYED_INTENT')
    return Object.freeze({
      ...base,
      ...describe(s),
      preparation: 'PREPARED_OFFLINE_NOT_EXECUTABLE',
      intent: Object.freeze({
        schemaVersion: 1,
        scope: expected,
        role: c.role as IntentRole,
        graphSchemaVersion: 1,
        graphRevision: c.graphRevision,
        intentId: r.intentId,
        sequence: r.sequence,
        providerId: s.providerId,
        method: s.method,
        model: s.model,
        workspace: s.workspace,
        permissions: s.permissions,
        budget: s.budget,
      }),
    })
  } catch (error) {
    return Object.freeze({
      ...base,
      ...requirements('UNKNOWN', [errorCode(error)]),
      preparation: 'REJECTED',
      intent: null,
    })
  }
}
