import type {
  AliceAccount,
  AliceConnectionState,
  AliceProviderClass,
  AliceRouteEvent,
} from './types'

export const ALICE_PROVIDER_OPTIONS: { id: string; label: string; kind: AliceProviderClass }[] = [
  { id: 'chatgpt-native', label: 'ChatGPT / Work', kind: 'native-surface' },
  { id: 'claude-work', label: 'Claude Cowork / Work', kind: 'native-surface' },
  { id: 'codex', label: 'Codex CLI', kind: 'cli-pty' },
  { id: 'claude', label: 'Claude Code', kind: 'cli-pty' },
  { id: 'opencode', label: 'OpenCode', kind: 'cli-pty' },
  { id: 'antigravity', label: 'Antigravity', kind: 'external-desktop-surface' },
  { id: 'chatgpt-web', label: 'ChatGPT', kind: 'web-conversation' },
  { id: 'claude-web', label: 'Claude', kind: 'web-conversation' },
  { id: 'other-web', label: 'Web', kind: 'web-conversation' },
  { id: 'github', label: 'GitHub canonical', kind: 'canonical-bridge' },
  { id: 'n8n', label: 'n8n', kind: 'n8n-bridge' },
  { id: 'future-api', label: 'API / MCP', kind: 'future-api' },
]
export const EMPTY_ALICE_STATE: AliceConnectionState = {
  version: 2,
  accounts: [],
  agents: [],
  sessions: [],
  n8n: { baseUrl: '', webhookPath: 'webhook/alice', health: 'disconnected', eventCount: 0 },
}

export function safeConnectionUrl(value: string): string {
  if (!value.trim()) return ''
  const url = new URL(value)
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('alice.invalidUrl')
  return url.href
}
export function validateAliceState(state: AliceConnectionState): AliceConnectionState {
  if (
    !state ||
    !Array.isArray(state.accounts) ||
    !Array.isArray(state.agents) ||
    !Array.isArray(state.sessions) ||
    !state.n8n ||
    typeof state.n8n.baseUrl !== 'string' ||
    !Number.isSafeInteger(state.n8n.eventCount) ||
    state.n8n.eventCount < 0
  )
    throw new Error('alice.invalidModel')
  const text = JSON.stringify(state)
  if (
    /"(?:password|token|apiKey|secretValue|access_token|refresh_token|authorization|clientSecret)"\s*:/i.test(
      text,
    )
  )
    throw new Error('alice.rawSecretRejected')
  if (state.version !== 1 && state.version !== 2) throw new Error('alice.invalidModel')
  for (const items of [
    state.accounts.map((a) => a.accountId),
    state.agents.map((a) => a.agentId),
    state.sessions.map((s) => s.sessionId),
  ]) {
    if (items.some((id) => typeof id !== 'string' || !id) || new Set(items).size !== items.length)
      throw new Error('alice.duplicateId')
  }
  for (const account of state.accounts) {
    if (
      typeof account.label !== 'string' ||
      !account.label.trim() ||
      typeof account.providerId !== 'string' ||
      ![
        'cli-pty',
        'native-surface',
        'canonical-bridge',
        'n8n-bridge',
        'future-api',
        'web-conversation',
        'external-desktop-surface',
      ].includes(account.providerClass)
    )
      throw new Error('alice.invalidModel')
    if (account.originalUrl) safeConnectionUrl(account.originalUrl)
    if (
      account.secretReference &&
      !/^alice[.:][a-z0-9._:-]{1,100}$/i.test(account.secretReference.key)
    )
      throw new Error('alice.rawSecretRejected')
  }
  safeConnectionUrl(state.n8n.baseUrl)
  if (
    state.n8n.webhookPath &&
    !/^(webhook|webhook-test)\/[a-zA-Z0-9_/-]{1,160}$/.test(state.n8n.webhookPath)
  )
    throw new Error('alice.invalidUrl')
  for (const agent of state.agents) {
    if (
      typeof agent.displayName !== 'string' ||
      !agent.displayName.trim() ||
      typeof agent.role !== 'string'
    )
      throw new Error('alice.invalidModel')
    if (!state.accounts.some((a) => a.accountId === agent.accountId))
      throw new Error('alice.invalidBinding')
    if (agent.canonicalIdentity && !ALICE_CANONICAL_IDENTITIES.includes(agent.canonicalIdentity))
      throw new Error('alice.invalidIdentity')
    if (agent.canonicalTaskUrl) safeConnectionUrl(agent.canonicalTaskUrl)
    if (
      agent.currentSessionId &&
      !state.sessions.some(
        (s) => s.sessionId === agent.currentSessionId && s.agentId === agent.agentId,
      )
    )
      throw new Error('alice.invalidBinding')
  }
  for (const session of state.sessions) {
    if (
      ![
        'pty',
        'provider-native',
        'native-surface',
        'canonical',
        'web-conversation',
        'external-desktop',
      ].includes(session.kind) ||
      typeof session.label !== 'string'
    )
      throw new Error('alice.invalidModel')
    if (
      session.kind === 'pty' &&
      state.version === 2 &&
      (!session.projectId || !session.paneId || !session.tabId || !session.providerId)
    )
      throw new Error('alice.invalidBinding')
    if (!state.agents.some((a) => a.agentId === session.agentId))
      throw new Error('alice.invalidBinding')
    if (session.surfaceUrl) {
      if (session.kind === 'web-conversation') safeConversationUrl(session.surfaceUrl)
      else safeConnectionUrl(session.surfaceUrl)
    }
    if (session.kind === 'web-conversation' && !session.surfaceUrl)
      throw new Error('alice.invalidBinding')
    if (session.canonicalUrl) safeConnectionUrl(session.canonicalUrl)
  }
  return state
}
export function accountCapabilities(account: AliceAccount) {
  return {
    openOriginal: Boolean(account.originalUrl),
    canonicalReference: true,
    privateConversationRead: false,
    privateConversationWrite: false,
    existingCliPty: account.providerClass === 'cli-pty',
  }
}
export function createSimulationEvent(
  state: AliceConnectionState,
  agentId: string,
): AliceRouteEvent {
  const agent = state.agents.find((a) => a.agentId === agentId)
  if (!agent) throw new Error('alice.invalidBinding')
  return {
    schemaVersion: 1,
    eventId: `alice-demo-event-${state.n8n.eventCount + 1}`,
    accountId: agent.accountId,
    agentId,
    sessionId: agent.currentSessionId,
    canonicalTaskUrl: agent.canonicalTaskUrl,
    mode: 'simulation',
    action: 'task.requested',
  }
}

export const ALICE_CANONICAL_IDENTITIES = [
  'GG',
  'SOL',
  'TERRA',
  'ARTE',
  'ARTE_2',
  'COSMO',
  'ASSISTENTE/WORK',
  'LUA_CLOUD',
]
export function validAliceDisplayName(value: string): string {
  const name = value.trim()
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name))
    throw new Error('alice.invalidName')
  return name
}
export function safeConversationUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error('alice.invalidUrl')
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.href.length > 2048 ||
    [...url.searchParams.keys()].some((key) =>
      /^(password|token|access_token|refresh_token|authorization|api_?key|client_secret)$/i.test(
        key,
      ),
    )
  )
    throw new Error('alice.invalidUrl')
  // Exact links, including navigation query/hash, stay private in local profile state.
  return url.href
}
