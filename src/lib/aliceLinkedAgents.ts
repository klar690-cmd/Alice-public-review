import { nanoid } from 'nanoid'

import {
  ALICE_CANONICAL_IDENTITIES,
  safeConversationUrl,
  validAliceDisplayName,
  validateAliceState,
} from './aliceModel'
import type { AliceAccount, AliceConnectionState, AliceSession } from './types'
export type ConnectAliceAgent = {
  accountId?: string
  accountLabel: string
  providerId: string
  providerClass: AliceAccount['providerClass']
  displayName: string
  role: string
  projectId: string
  conversationUrl: string
  canonicalIdentity?: string
  canonicalTaskUrl?: string
}
export function connectAliceAgent(
  state: AliceConnectionState,
  input: ConnectAliceAgent,
): AliceConnectionState {
  const displayName = validAliceDisplayName(input.displayName)
  if (input.canonicalIdentity && !ALICE_CANONICAL_IDENTITIES.includes(input.canonicalIdentity))
    throw new Error('alice.invalidIdentity')
  if (input.canonicalTaskUrl) {
    let reference: URL
    try {
      reference = new URL(input.canonicalTaskUrl)
    } catch {
      throw new Error('alice.invalidUrl')
    }
    if (
      reference.protocol !== 'https:' ||
      reference.host !== 'github.com' ||
      reference.username ||
      reference.password ||
      reference.search ||
      reference.hash ||
      !/^\/klar690-cmd\/RumoAoMilhao\/blob\/[^/]+\/docs\/coordination\/PHASE_[A-Z0-9_]+\.md$/.test(
        reference.pathname,
      )
    )
      throw new Error('alice.invalidUrl')
  }
  const existing = input.accountId
    ? state.accounts.find((a) => a.accountId === input.accountId)
    : undefined
  if (
    input.accountId &&
    (!existing ||
      existing.providerId !== input.providerId ||
      existing.providerClass !== input.providerClass)
  )
    throw new Error('alice.invalidBinding')
  const account = existing ?? {
    accountId: nanoid(),
    providerId: input.providerId,
    providerClass: input.providerClass,
    label: validAliceDisplayName(input.accountLabel),
    authMethod: 'none' as const,
    health: 'metadata-only' as const,
  }
  const linked =
    account.providerClass === 'web-conversation' ||
    account.providerClass === 'external-desktop-surface'
  if (linked && !input.projectId) throw new Error('alice.invalidBinding')
  if (account.providerClass === 'external-desktop-surface' && account.providerId !== 'antigravity')
    throw new Error('alice.invalidBinding')
  const agentId = nanoid(),
    sessionId = linked ? nanoid() : null
  const session: AliceSession | null = linked
    ? {
        sessionId: sessionId!,
        agentId,
        label: displayName,
        kind:
          account.providerClass === 'web-conversation' ? 'web-conversation' : 'external-desktop',
        providerId: account.providerId,
        projectId: input.projectId,
        health: 'configured',
        ...(account.providerClass === 'web-conversation'
          ? { surfaceUrl: safeConversationUrl(input.conversationUrl) }
          : {}),
      }
    : null
  return validateAliceState({
    ...state,
    version: 2,
    accounts: existing ? state.accounts : [...state.accounts, account],
    agents: [
      ...state.agents,
      {
        agentId,
        displayName,
        role: input.role.trim(),
        accountId: account.accountId,
        projectId: input.projectId || null,
        currentSessionId: sessionId,
        canonicalIdentity: input.canonicalIdentity || undefined,
        canonicalTaskUrl: input.canonicalTaskUrl || undefined,
        status: 'idle',
      },
    ],
    sessions: session ? [...state.sessions, session] : state.sessions,
  })
}
export function renameAliceAgent(
  state: AliceConnectionState,
  agentId: string,
  name: string,
): AliceConnectionState {
  if (!state.agents.some((a) => a.agentId === agentId)) throw new Error('alice.invalidBinding')
  const displayName = validAliceDisplayName(name)
  return validateAliceState({
    ...state,
    agents: state.agents.map((a) => (a.agentId === agentId ? { ...a, displayName } : a)),
  })
}
export function removeLinkedAliceAgent(
  state: AliceConnectionState,
  agentId: string,
): AliceConnectionState {
  const agent = state.agents.find((a) => a.agentId === agentId),
    account = state.accounts.find((a) => a.accountId === agent?.accountId)
  if (
    !agent ||
    !account ||
    !['web-conversation', 'external-desktop-surface'].includes(account.providerClass)
  )
    throw new Error('alice.invalidBinding')
  return validateAliceState({
    ...state,
    agents: state.agents.filter((a) => a.agentId !== agentId),
    sessions: state.sessions.filter((s) => s.agentId !== agentId),
  })
}
export function originalConversation(state: AliceConnectionState, agentId: string): string {
  const agent = state.agents.find((a) => a.agentId === agentId),
    session = state.sessions.find(
      (s) =>
        s.agentId === agentId &&
        s.sessionId === agent?.currentSessionId &&
        s.kind === 'web-conversation',
    )
  if (!session?.surfaceUrl) throw new Error('alice.invalidBinding')
  return safeConversationUrl(session.surfaceUrl)
}
