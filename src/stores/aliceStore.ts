import { nanoid } from 'nanoid'
import { create } from 'zustand'

import { bindAliceTab, cliBindingSupported, reconcileAliceSessions } from '../lib/aliceBinding'
import { createLiveEvent, readRumoCanonical } from '../lib/aliceCanonical'
import { isAlicePreview } from '../lib/aliceEnvironment'
import { prepareAliceManualHandoff } from '../lib/aliceHandoff'
import { requestN8n } from '../lib/aliceHttp'
import {
  type ConnectAliceAgent,
  connectAliceAgent,
  removeLinkedAliceAgent,
  renameAliceAgent,
} from '../lib/aliceLinkedAgents'
import { EMPTY_ALICE_STATE, safeConnectionUrl, validateAliceState } from '../lib/aliceModel'
import { loadAliceProfile, saveAliceProfile } from '../lib/alicePersistence'
import { findCliLauncher, ptyExists } from '../lib/tauri'
import type {
  AliceAccount,
  AliceCanonicalBinding,
  AliceCanonicalSnapshot,
  AliceConnectionState,
  AliceLiveEvent,
} from '../lib/types'
import { useProjectsStore } from './projectsStore'
import { useUiStore } from './uiStore'

type State = AliceConnectionState & {
  connectAgent: (input: ConnectAliceAgent) => void
  renameAgent: (id: string, name: string) => void
  removeLinkedAgent: (id: string) => void
  openLinkedAgent: (id: string) => void
  prepareManualHandoff: (
    id: string,
    projectId: string,
    expected: AliceCanonicalBinding,
  ) => Promise<void>
  lastHandoff: ReturnType<typeof prepareAliceManualHandoff> | null
  profileId: string | null
  persistenceOk: boolean
  selectedAccountId: string | null
  lastEvent: AliceLiveEvent | null
  canonical: AliceCanonicalSnapshot | null
  canonicalError: string
  addAccount: (
    label: string,
    provider: string,
    kind: AliceAccount['providerClass'],
    url: string,
  ) => string
  addAgent: (accountId: string, name: string, role: string) => void
  setN8nUrl: (url: string, path?: string) => void
  testN8n: () => Promise<void>
  sendTestEvent: (agentId: string, projectId: string) => Promise<void>
  refreshCanonical: () => Promise<void>
  dispatchCanonical: (
    agentId: string,
    projectId: string,
    expected: AliceCanonicalBinding,
  ) => Promise<void>
  selectAccount: (id: string) => void
  loadProfile: (id: string, seed?: AliceConnectionState) => void
  bindTab: (agentId: string, projectId: string, paneId: string, tabId: string) => void
  createSession: (agentId: string, projectId: string) => Promise<void>
  resumeSession: (agentId: string, sessionId: string) => void
  refreshBinding: (agentId: string) => Promise<void>
}
let profileEpoch = 0
export const useAliceStore = create<State>((set, get) => ({
  ...structuredClone(EMPTY_ALICE_STATE),
  lastHandoff: null,
  profileId: null,
  persistenceOk: true,
  selectedAccountId: null,
  lastEvent: null,
  canonical: null,
  canonicalError: '',
  loadProfile: (id, seed) => {
    profileEpoch++
    let state = structuredClone(EMPTY_ALICE_STATE)
    try {
      state = loadAliceProfile(localStorage, id, isAlicePreview)
    } catch {
      /* storage is optional */
    }
    set({
      ...state,
      ...(seed && state.accounts.length === 0 ? seed : {}),
      profileId: id,
      persistenceOk: true,
      selectedAccountId: null,
      lastEvent: null,
      lastHandoff: null,
      canonical: null,
      canonicalError: '',
    })
  },
  connectAgent: (input) => {
    if (
      input.projectId &&
      !useProjectsStore.getState().projects.some((p) => p.id === input.projectId)
    )
      throw new Error('alice.invalidBinding')
    const next = connectAliceAgent(get(), input)
    set({
      accounts: next.accounts,
      agents: next.agents,
      sessions: next.sessions,
      selectedAccountId: next.agents.at(-1)!.accountId,
    })
  },
  renameAgent: (id, name) => set({ agents: renameAliceAgent(get(), id, name).agents }),
  removeLinkedAgent: (id) => {
    const state = get(),
      next = removeLinkedAliceAgent(state, id)
    for (const session of state.sessions.filter((s) => s.agentId === id)) {
      const pane = useProjectsStore
        .getState()
        .projects.find((p) => p.id === session.projectId)
        ?.terminals.find((p) => p.id === session.paneId)
      if (
        (pane?.kind === 'alice-agent-session' ||
          (pane?.kind === 'plugin' && pane.pluginId === 'alice-agent-session')) &&
        session.projectId
      )
        useProjectsStore.getState().deleteTerminal(session.projectId, pane.id)
    }
    set({ agents: next.agents, sessions: next.sessions, lastHandoff: null, lastEvent: null })
  },
  openLinkedAgent: (id) => {
    const state = get(),
      agent = state.agents.find((a) => a.agentId === id),
      session = state.sessions.find(
        (s) => s.agentId === id && s.sessionId === agent?.currentSessionId,
      )
    const projects = useProjectsStore.getState(),
      projectId = session?.projectId ?? agent?.projectId,
      project = projects.projects.find((p) => p.id === projectId)
    if (!agent || !session || !project) throw new Error('alice.invalidBinding')
    let pane = project.terminals.find((p) => p.id === session.paneId)
    if (session.kind === 'pty') {
      if (
        !pane ||
        pane.kind ||
        !pane.tabs.some((tab) => tab.id === session.tabId && tab.type === session.providerId)
      )
        throw new Error('alice.invalidBinding')
    } else {
      if (
        pane &&
        pane.kind !== 'alice-agent-session' &&
        !(pane.kind === 'plugin' && pane.pluginId === 'alice-agent-session')
      )
        throw new Error('alice.invalidBinding')
      pane ??= projects.createPluginPane(project.id, 'alice-agent-session', agent.displayName)
      if (pane.kind === 'plugin')
        useProjectsStore.setState((current) => ({
          projects: current.projects.map((p) =>
            p.id === project.id
              ? {
                  ...p,
                  terminals: p.terminals.map((t) =>
                    t.id === pane!.id
                      ? { ...t, kind: 'alice-agent-session' as const, pluginId: undefined }
                      : t,
                  ),
                }
              : p,
          ),
        }))
      set({
        sessions: state.sessions.map((s) =>
          s.sessionId === session.sessionId
            ? { ...s, paneId: pane!.id, tabId: pane!.activeTabId, projectId: project.id }
            : s,
        ),
      })
    }
    if (session.kind === 'pty') projects.setTerminalTopbarPinned(project.id, pane.id, true)
    projects.addTerminalToWorkspace(project.id, pane.id)
    projects.focusWorkspaceTerminal(project.id, pane.id)
    useUiStore.getState().setActiveView('workspace')
  },
  prepareManualHandoff: async (id, projectId, expected) => {
    const epoch = profileEpoch,
      state = get(),
      canonical = await readRumoCanonical()
    if (epoch !== profileEpoch || get().profileId !== state.profileId)
      throw new Error('alice.invalidBinding')
    const lastHandoff = prepareAliceManualHandoff(state, id, projectId, canonical, expected)
    set({ canonical, lastHandoff })
  },
  addAccount: (label, providerId, providerClass, url) => {
    const accountId = nanoid()
    const account: AliceAccount = {
      accountId,
      providerId,
      providerClass,
      label: label.trim(),
      authMethod: providerClass === 'native-surface' ? 'native-ui' : 'provider-managed',
      health: 'metadata-only',
      originalUrl: safeConnectionUrl(url),
    }
    if (!account.label) throw new Error('alice.invalidModel')
    const accounts = [...get().accounts, account]
    validateAliceState({ ...get(), accounts })
    set({ accounts, selectedAccountId: accountId })
    return accountId
  },
  addAgent: (accountId, name, role) => {
    if (!name.trim()) throw new Error('alice.invalidModel')
    const agents = [
      ...get().agents,
      {
        agentId: nanoid(),
        displayName: name.trim(),
        role: role.trim(),
        accountId,
        currentSessionId: null,
        projectId: null,
        status: 'idle' as const,
      },
    ]
    validateAliceState({ ...get(), agents })
    set({ agents })
  },
  selectAccount: (id) => set({ selectedAccountId: id }),
  setN8nUrl: (url, path = 'webhook/alice') => {
    const n8n = {
      baseUrl: safeConnectionUrl(url),
      webhookPath: path,
      health: 'disconnected' as const,
      eventCount: get().n8n.eventCount,
    }
    validateAliceState({ ...get(), n8n })
    set({ n8n })
  },
  testN8n: async () => {
    const epoch = profileEpoch
    const { profileId, n8n } = get()
    set({ n8n: { ...n8n, health: 'checking' } })
    const result = await requestN8n({ baseUrl: n8n.baseUrl, path: 'healthz' })
    if (
      epoch === profileEpoch &&
      get().profileId === profileId &&
      get().n8n.baseUrl === n8n.baseUrl
    )
      set({
        n8n: {
          ...get().n8n,
          health: result.ok ? 'connected' : result.status ? 'degraded' : 'disconnected',
          lastResult: result,
        },
      })
  },
  sendTestEvent: async (agentId, projectId) => {
    const epoch = profileEpoch
    const state = get()
    const event = createLiveEvent(state, agentId, projectId, 'connection.test')
    const result = await requestN8n({
      baseUrl: state.n8n.baseUrl,
      path: state.n8n.webhookPath ?? 'webhook/alice',
      event,
    })
    if (
      epoch === profileEpoch &&
      get().profileId === state.profileId &&
      get().n8n.baseUrl === state.n8n.baseUrl
    )
      set({
        lastEvent: event,
        n8n: {
          ...get().n8n,
          health: result.ok ? 'connected' : result.status ? 'degraded' : 'disconnected',
          eventCount: get().n8n.eventCount + (result.ok ? 1 : 0),
          lastResult: result,
        },
      })
  },
  refreshCanonical: async () => {
    const epoch = profileEpoch
    const profileId = get().profileId
    try {
      const canonical = await readRumoCanonical()
      if (epoch === profileEpoch && get().profileId === profileId)
        set({ canonical, canonicalError: '' })
    } catch {
      if (epoch === profileEpoch && get().profileId === profileId)
        set({ canonical: null, canonicalError: 'alice.canonicalUnavailable' })
    }
  },
  dispatchCanonical: async (agentId, projectId, expected) => {
    const epoch = profileEpoch
    const state = get()
    // Re-read immutable GitHub snapshots immediately before preparing an external dispatch.
    const canonical = await readRumoCanonical()
    if (epoch !== profileEpoch || get().profileId !== state.profileId)
      throw new Error('alice.invalidBinding')
    const event = createLiveEvent(state, agentId, projectId, 'canonical.dispatch.requested', {
      snapshot: canonical,
      expected,
    })
    // V1 prepares a governed command. The canonical runner owns approval/execution.
    if (epoch === profileEpoch && get().profileId === state.profileId)
      set({ canonical, lastEvent: event })
  },
  bindTab: (agentId, projectId, paneId, tabId) => {
    const project = useProjectsStore.getState().projects.find((p) => p.id === projectId)
    if (!project) throw new Error('alice.invalidBinding')
    const session = bindAliceTab(get(), agentId, project, paneId, tabId)
    const sessions = [...get().sessions.filter((s) => s.sessionId !== session.sessionId), session]
    const agents = get().agents.map((a) =>
      a.agentId === agentId ? { ...a, currentSessionId: session.sessionId, projectId } : a,
    )
    validateAliceState({ ...get(), sessions, agents })
    set({ sessions, agents })
  },
  createSession: async (agentId, projectId) => {
    const epoch = profileEpoch
    const state = get(),
      agent = state.agents.find((a) => a.agentId === agentId),
      account = state.accounts.find((a) => a.accountId === agent?.accountId)
    const project = useProjectsStore.getState().projects.find((p) => p.id === projectId)
    if (isAlicePreview || !agent || !account || !cliBindingSupported(account) || !project)
      throw new Error('alice.nativeRuntime')
    if (!(await findCliLauncher(account.providerId))) throw new Error('alice.cliUnavailable')
    if (epoch !== profileEpoch || get().profileId !== state.profileId)
      throw new Error('alice.invalidBinding')
    const cwd = project.defaultCwd?.trim() || project.terminals.find((t) => t.cwd)?.cwd
    if (!cwd) throw new Error('alice.invalidBinding')
    const terminal = await useProjectsStore.getState().createAgentTerminal(projectId, {
      name: agent.displayName,
      cwd,
      firstTab: { type: account.providerId, cwd },
    })
    if (epoch !== profileEpoch || get().profileId !== state.profileId)
      throw new Error('alice.invalidBinding')
    get().bindTab(agentId, projectId, terminal.id, terminal.activeTabId)
    useProjectsStore.getState().openProjectWorkspace(projectId)
  },
  resumeSession: (agentId, sessionId) => {
    const session = get().sessions.find(
      (s) => s.sessionId === sessionId && s.agentId === agentId && s.kind === 'pty',
    )
    if (isAlicePreview || !session?.projectId || !session.paneId || !session.tabId)
      throw new Error('alice.nativeRuntime')
    get().bindTab(agentId, session.projectId, session.paneId, session.tabId)
    const projects = useProjectsStore.getState()
    projects.setTerminalDisabled(session.projectId, session.paneId, false)
    projects.setActiveTab(session.projectId, session.paneId, session.tabId)
    projects.openProjectWorkspace(session.projectId)
  },
  refreshBinding: async (agentId) => {
    const epoch = profileEpoch
    const state = get(),
      sessions = reconcileAliceSessions(state.sessions, useProjectsStore.getState().projects)
    if (!isAlicePreview)
      for (const session of sessions.filter((s) => s.agentId === agentId && s.ptyId)) {
        try {
          if (!(await ptyExists(session.ptyId!))) {
            session.ptyId = undefined
            session.health = 'disconnected'
          }
        } catch {
          session.ptyId = undefined
          session.health = 'disconnected'
        }
      }
    if (epoch === profileEpoch && get().profileId === state.profileId) set({ sessions })
  },
}))
// Synchronous profile-scoped writes cannot land in a later profile after a switch.
let saving = false
useAliceStore.subscribe((state, previous) => {
  if (saving || !state.profileId) return
  if (
    state.accounts === previous.accounts &&
    state.agents === previous.agents &&
    state.sessions === previous.sessions &&
    state.n8n === previous.n8n &&
    state.profileId === previous.profileId
  )
    return
  saving = true
  let ok = false
  try {
    ok = saveAliceProfile(localStorage, state.profileId, state, isAlicePreview)
  } catch {
    /* in-memory fallback */
  }
  if (ok !== state.persistenceOk) useAliceStore.setState({ persistenceOk: ok })
  saving = false
})
export function startAliceProfileSync(seed?: () => AliceConnectionState): () => void {
  const sync = () => {
    const projects = useProjectsStore.getState()
    if (!projects.hydrated) return
    if (useAliceStore.getState().profileId !== projects.activeProfileId) {
      useAliceStore
        .getState()
        .loadProfile(
          projects.activeProfileId,
          isAlicePreview && projects.activeProfileId === 'alice-preview' ? seed?.() : undefined,
        )
    } else {
      const before = useAliceStore.getState().sessions
      const sessions = reconcileAliceSessions(before, projects.projects)
      if (JSON.stringify(sessions) !== JSON.stringify(before)) useAliceStore.setState({ sessions })
    }
  }
  sync()
  return useProjectsStore.subscribe(sync)
}
