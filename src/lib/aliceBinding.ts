import { isKnownAgentType, resolveAgentCliCommand } from './agentProviders'
import type {
  AliceAccount,
  AliceCapabilities,
  AliceConnectionState,
  AliceSession,
  Project,
} from './types'

export function cliBindingSupported(account: AliceAccount): boolean {
  return (
    account.providerClass === 'cli-pty' &&
    account.providerId !== 'antigravity' &&
    isKnownAgentType(account.providerId) &&
    Boolean(resolveAgentCliCommand(account.providerId))
  )
}
export function aliceCapabilities(
  account: AliceAccount,
  native: boolean,
  session?: AliceSession,
): AliceCapabilities {
  const supported = cliBindingSupported(account)
  const live = native && supported && session?.health === 'bound' && Boolean(session.ptyId)
  return {
    createSession: native && supported,
    resumeSession: native && supported,
    sendInput: live,
    streamOutput: live,
    readHistory: live,
    ptyAttach: live,
    filesWorkspace: native && supported,
    stopRestart: live,
    mcpSkills: native && supported && ['claude', 'codex', 'opencode'].includes(account.providerId),
    usageTelemetry: native && supported && ['claude', 'codex'].includes(account.providerId),
    canonicalTaskBridge: true,
    openOriginal: Boolean(
      session?.kind === 'web-conversation' ? session.surfaceUrl : account.originalUrl,
    ),
  }
}
export function bindAliceTab(
  state: AliceConnectionState,
  agentId: string,
  project: Project,
  paneId: string,
  tabId: string,
): AliceSession {
  const agent = state.agents.find((a) => a.agentId === agentId)
  const account = state.accounts.find((a) => a.accountId === agent?.accountId)
  const pane = project.terminals.find((t) => t.id === paneId)
  const tab = pane?.tabs.find((t) => t.id === tabId)
  if (
    !agent ||
    !account ||
    !cliBindingSupported(account) ||
    !pane ||
    pane.kind ||
    !tab ||
    tab.type !== account.providerId ||
    state.sessions.some(
      (s) =>
        s.projectId === project.id &&
        s.paneId === paneId &&
        s.tabId === tabId &&
        s.agentId !== agentId,
    )
  )
    throw new Error('alice.invalidBinding')
  return {
    sessionId: tabId,
    agentId,
    label: pane.name,
    kind: 'pty',
    providerId: tab.type,
    providerHandle: tab.sessionId,
    ptyId: tab.ptyId ?? undefined,
    projectId: project.id,
    paneId,
    tabId,
    workspace: tab.cwd || pane.cwd,
    health: tab.ptyId ? 'bound' : 'configured',
  }
}
export function reconcileAliceSessions(
  sessions: AliceSession[],
  projects: Project[],
): AliceSession[] {
  return sessions.map((s) => {
    if (s.kind !== 'pty' || !s.projectId || !s.tabId) return s
    const project = projects.find((p) => p.id === s.projectId)
    const pane = project?.terminals.find((p) => p.id === s.paneId)
    const tab = pane?.tabs.find((t) => t.id === s.tabId)
    if (!tab || pane?.kind || tab.type !== s.providerId)
      return { ...s, ptyId: undefined, health: 'disconnected' }
    return {
      ...s,
      ptyId: tab.ptyId ?? undefined,
      providerHandle: tab.sessionId,
      workspace: tab.cwd,
      health: tab.ptyId ? 'bound' : 'configured',
    }
  })
}
