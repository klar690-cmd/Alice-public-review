import { PolicyError, rejectSecretMaterial } from './securityPolicy'

export const PROVIDER_IDS = [
  'fake',
  'codex',
  'claude',
  'copilot',
  'cursor',
  'antigravity',
  'opencode',
  'mimo',
  'freebuff',
  'kiro',
  'kimi',
  'grok',
  'codewhale',
] as const
export type UiProvider = (typeof PROVIDER_IDS)[number]
export const CONNECTION_METHODS = [
  'simulated',
  'local-cli',
  'account-login',
  'api-key',
  'managed-cloud',
] as const
export type UiMethod = (typeof CONNECTION_METHODS)[number]
export type ProviderUiStatus =
  'SIMULATED' | 'NATIVE_QA_PENDING' | 'REQUIRES_INTEGRATION' | 'UNAVAILABLE'
export type UiScope = Readonly<{
  ownerId: string
  profileId: string
  projectId: string
  configId: string
  nodeId: string
}>
export type ProviderUiSelection = Readonly<{
  schemaVersion: 1
  scope: UiScope
  providerId: UiProvider
  method: UiMethod
  model: 'provider-default'
  workspace: 'simulation-only'
  permissions: 'no-real-access'
  budget: 'no-paid-use'
  connected: false
  executable: false
}>
export type ProviderUiSettings = Readonly<Record<string, ProviderUiSelection>>

const labels: Record<UiProvider, string> = {
  fake: 'Simulated local',
  codex: 'OpenAI / Codex',
  claude: 'Anthropic / Claude Code',
  copilot: 'GitHub Copilot',
  cursor: 'Cursor',
  antigravity: 'Google Antigravity',
  opencode: 'OpenCode',
  mimo: 'MiMo',
  freebuff: 'Freebuff',
  kiro: 'Kiro',
  kimi: 'Kimi',
  grok: 'Grok Build',
  codewhale: 'Codewhale',
}
export const providerLabel = (provider: UiProvider): string => labels[provider]

/** Source-backed display matrix, not auth readiness or a provider adapter. */
export function methodCapability(
  provider: UiProvider,
  method: UiMethod,
): Readonly<{
  selectable: boolean
  status: ProviderUiStatus
  reason:
    | 'simulation'
    | 'nativeQa'
    | 'claudeBlocked'
    | 'accountApproval'
    | 'genericCli'
    | 'apiFuture'
    | 'cloudFuture'
    | 'unsupported'
}> {
  if (!PROVIDER_IDS.includes(provider) || !CONNECTION_METHODS.includes(method))
    throw new PolicyError('INVALID_PROVIDER_SELECTION')
  if (method === 'simulated')
    return Object.freeze({ selectable: true, status: 'SIMULATED', reason: 'simulation' })
  if (provider === 'fake')
    return Object.freeze({ selectable: false, status: 'UNAVAILABLE', reason: 'unsupported' })
  if (method === 'account-login')
    return Object.freeze({ selectable: false, status: 'UNAVAILABLE', reason: 'accountApproval' })
  if (method === 'local-cli')
    return Object.freeze(
      provider === 'claude'
        ? { selectable: false, status: 'UNAVAILABLE', reason: 'claudeBlocked' }
        : provider === 'codex'
          ? { selectable: true, status: 'NATIVE_QA_PENDING', reason: 'nativeQa' }
          : { selectable: true, status: 'REQUIRES_INTEGRATION', reason: 'genericCli' },
    )
  // Public programmable surfaces documented in the canonical R255/R258 review; none integrated here.
  const programmable = ['codex', 'claude', 'copilot', 'cursor', 'antigravity'].includes(provider)
  return Object.freeze(
    programmable
      ? {
          selectable: true,
          status: 'REQUIRES_INTEGRATION',
          reason: method === 'api-key' ? 'apiFuture' : 'cloudFuture',
        }
      : { selectable: false, status: 'UNAVAILABLE', reason: 'unsupported' },
  )
}

/** A blocked account/API preference is editable UI data, never connection availability. */
export function canChooseProviderMethod(provider: UiProvider, method: UiMethod): boolean {
  const capability = methodCapability(provider, method)
  return (
    capability.selectable || (provider !== 'fake' && ['account-login', 'api-key'].includes(method))
  )
}

function fail(code: string): never {
  throw new PolicyError(code)
}
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  rejectSecretMaterial(value)
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('INVALID_PROVIDER_SELECTION')
  const o = value as Record<string, unknown>
  if (Object.keys(o).length !== keys.length || Object.keys(o).some((k) => !keys.includes(k)))
    fail('INVALID_PROVIDER_SELECTION')
  return o
}
function validScope(value: unknown): UiScope {
  const s = object(value, ['ownerId', 'profileId', 'projectId', 'configId', 'nodeId'])
  for (const key of Object.keys(s))
    if (
      typeof s[key] !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,120}$/.test(s[key] as string) ||
      ['__proto__', 'constructor', 'prototype'].includes(s[key] as string)
    )
      fail('INVALID_UI_SCOPE')
  return Object.freeze({ ...s }) as UiScope
}
export function defaultProviderSelection(scope: UiScope): ProviderUiSelection {
  return Object.freeze({
    schemaVersion: 1,
    scope: validScope(scope),
    providerId: 'fake',
    method: 'simulated',
    model: 'provider-default',
    workspace: 'simulation-only',
    permissions: 'no-real-access',
    budget: 'no-paid-use',
    connected: false,
    executable: false,
  })
}
export function validateProviderSelection(
  value: unknown,
  expectedScope: UiScope,
): ProviderUiSelection {
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
    ]),
    scope = validScope(s.scope),
    expected = validScope(expectedScope)
  if (
    Object.keys(expected).some(
      (key) => scope[key as keyof UiScope] !== expected[key as keyof UiScope],
    )
  )
    fail('FOREIGN_UI_SCOPE')
  if (
    s.schemaVersion !== 1 ||
    !PROVIDER_IDS.includes(s.providerId as UiProvider) ||
    !CONNECTION_METHODS.includes(s.method as UiMethod)
  )
    fail('INVALID_PROVIDER_SELECTION')
  if (!canChooseProviderMethod(s.providerId as UiProvider, s.method as UiMethod))
    fail('UNAVAILABLE_PROVIDER_METHOD')
  if (
    s.model !== 'provider-default' ||
    s.workspace !== 'simulation-only' ||
    s.permissions !== 'no-real-access' ||
    s.budget !== 'no-paid-use' ||
    s.connected !== false ||
    s.executable !== false
  )
    fail('REAL_ACCESS_NOT_ALLOWED')
  return Object.freeze({ ...s, scope }) as ProviderUiSelection
}
export function updateProviderSelection(
  current: ProviderUiSelection,
  patch: unknown,
  scope: UiScope,
): ProviderUiSelection {
  rejectSecretMaterial(patch)
  if (!patch || typeof patch !== 'object' || Array.isArray(patch))
    fail('INVALID_PROVIDER_SELECTION')
  const p = patch as Record<string, unknown>
  if (
    !Object.keys(p).length ||
    Object.keys(p).some((key) => !['providerId', 'method'].includes(key))
  )
    fail('INVALID_PROVIDER_SELECTION')
  return validateProviderSelection(
    {
      ...current,
      ...p,
      ...(p.providerId !== undefined &&
      p.providerId !== current.providerId &&
      p.method === undefined
        ? { method: 'simulated' }
        : {}),
    },
    scope,
  )
}
export function exportProviderSettings(settings: ProviderUiSettings): string {
  rejectSecretMaterial(settings)
  if (Object.keys(settings).length > 12) fail('UI_SETTINGS_LIMIT')
  const sanitized: Record<string, ProviderUiSelection> = {}
  const first = Object.values(settings)[0]
  const base = first ? validScope(first.scope) : null
  for (const [nodeId, value] of Object.entries(settings)) {
    if (nodeId !== value.scope.nodeId) fail('FOREIGN_UI_SCOPE')
    sanitized[nodeId] = validateProviderSelection(value, { ...base!, nodeId })
  }
  return JSON.stringify({
    format: 'alice.provider-ui-settings.v1',
    simulationOnly: true,
    executable: false,
    settings: sanitized,
  })
}
