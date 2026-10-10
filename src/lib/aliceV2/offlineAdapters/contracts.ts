import { PolicyError, rejectSecretMaterial, type Scope } from '../securityPolicy'

export const OFFLINE = 'SIMULATED_OFFLINE_ONLY' as const
export type EventKind =
  | 'opened'
  | 'resumed'
  | 'started'
  | 'text'
  | 'tool'
  | 'approval'
  | 'answer'
  | 'usage'
  | 'artifact'
  | 'completed'
  | 'failed'
  | 'cancel-requested'
  | 'cancelled'
  | 'steered'
  | 'interrupted'
  | 'correction'
  | 'status'
export type FixtureFrame = Readonly<{
  marker: typeof OFFLINE
  schemaVersion: 1
  scope: Scope
  sequence: number
  wire: Readonly<Record<string, unknown>>
}>
export type NormalizedEvent = Readonly<{
  marker: typeof OFFLINE
  executable: false
  scope: Scope
  sequence: number
  eventId: string
  kind: EventKind
  data: Readonly<Record<string, unknown>>
}>
export type AdapterState =
  | 'created'
  | 'opened'
  | 'running'
  | 'awaiting-approval'
  | 'cancelling'
  | 'completed'
  | 'failed'
  | 'cancelled'

export function deny(code: string): never {
  throw new PolicyError(code)
}
export function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  rejectSecretMaterial(value)
  if (!value || typeof value !== 'object' || Array.isArray(value)) deny('MALFORMED_FIXTURE')
  const object = value as Record<string, unknown>
  if (
    Object.keys(object).length !== keys.length ||
    Object.keys(object).some((key) => !keys.includes(key))
  )
    deny('MALFORMED_FIXTURE')
  return object
}
export function fixtureId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(value))
    deny('INVALID_FIXTURE_ID')
}
export function count(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    deny('INVALID_FIXTURE_NUMBER')
}
export function plainText(value: unknown): asserts value is string {
  rejectSecretMaterial(value)
  if (
    typeof value !== 'string' ||
    value.length > 4096 ||
    /:\/\/|\{\{|\}\}|\$\{|\.\.[\\/]|[\u0000-\u001f]/.test(value)
  )
    deny('UNSAFE_FIXTURE_TEXT')
}
export function checkedScope(value: unknown): Scope {
  const scope = record(value, [
    'projectId',
    'graphRevision',
    'nodeId',
    'runId',
    'attemptId',
    'provider',
    'mode',
  ])
  for (const key of ['projectId', 'nodeId', 'runId', 'attemptId']) fixtureId(scope[key])
  count(scope.graphRevision)
  if (!['codex', 'claude'].includes(String(scope.provider))) deny('UNSUPPORTED_PROVIDER')
  if (scope.mode !== (scope.provider === 'codex' ? 'local-app-server' : 'local-cli-json'))
    deny('UNSUPPORTED_METHOD')
  return Object.freeze(structuredClone(scope)) as Scope
}
export function sameScope(a: Scope, b: Scope): boolean {
  return (Object.keys(a) as (keyof Scope)[]).every((key) => a[key] === b[key])
}
export function immutable<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(immutable)
    Object.freeze(value)
  }
  return value
}
export function capabilities(provider: string) {
  const supported = provider === 'codex' || provider === 'claude'
  return immutable({
    provider,
    marker: OFFLINE,
    executable: false as const,
    fixtureAvailable: supported,
    runtime:
      provider === 'claude'
        ? 'UNAVAILABLE_BLOCKED_UNSUPPORTED'
        : provider === 'codex'
          ? 'NOT_NATIVE_CERTIFIED'
          : 'NOT_YET_STRUCTURED_UNAVAILABLE',
    protocolVersion: supported ? `alice.fixture.${provider}.v1` : null,
    vendorWireCompatibility: 'UNVERIFIED' as const,
    steer:
      provider === 'codex'
        ? 'turn-steer-fixture'
        : provider === 'claude'
          ? 'interrupt-then-queue-fixture'
          : 'unsupported',
  })
}
