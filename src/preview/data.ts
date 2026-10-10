import {
  type AliceConnectionState,
  EMPTY_PROJECTS_FILE,
  type ProjectsFile,
  type Terminal,
} from '../lib/types'

export const DEMO_CANONICAL_URL =
  'https://github.com/klar690-cmd/RumoAoMilhao/blob/main/docs/coordination/PHASE_ASSISTENTE_R216_ALICE_LIVE_ORCHESTRATION_V1.md'
export function createDemoConnections(): AliceConnectionState {
  const names = ['GG', 'ARTE', 'ARTE_2']
  return {
    version: 2,
    accounts: [
      {
        accountId: 'demo-cli',
        providerId: 'codex',
        providerClass: 'cli-pty',
        label: 'Codex CLI · desktop',
        authMethod: 'provider-managed',
        health: 'metadata-only',
      },
      {
        accountId: 'demo-chatgpt-a',
        providerId: 'chatgpt-native',
        providerClass: 'native-surface',
        label: 'ChatGPT Account A',
        authMethod: 'native-ui',
        health: 'metadata-only',
        originalUrl: 'https://chatgpt.com/',
      },
    ],
    agents: [
      {
        agentId: 'demo-assistente',
        canonicalIdentity: 'ASSISTENTE/WORK',
        displayName: 'ASSISTENTE/WORK',
        role: 'Live orchestration',
        accountId: 'demo-cli',
        currentSessionId: 'demo-pty-disabled',
        projectId: 'alice-demo',
        status: 'idle',
      },
      ...names.map((displayName, i) => ({
        agentId: `demo-agent-${i}`,
        displayName,
        role: ['Governance & orchestration', 'Visual direction', 'Visual variations'][i],
        accountId: 'demo-chatgpt-a',
        currentSessionId: `demo-session-${i}-native`,
        projectId: 'alice-demo',
        canonicalTaskUrl: DEMO_CANONICAL_URL,
        status: 'native-only' as const,
      })),
    ],
    sessions: [
      {
        sessionId: 'demo-pty-disabled',
        agentId: 'demo-assistente',
        label: 'Codex CLI · desktop',
        kind: 'pty',
        providerId: 'codex',
        projectId: 'alice-demo',
        paneId: 'pane-pty',
        tabId: 'demo-pty-disabled',
        workspace: 'C:\\Projetos\\Alice',
        health: 'configured',
      },
      ...names.flatMap((name, i) => [
        {
          sessionId: `demo-session-${i}-native`,
          agentId: `demo-agent-${i}`,
          label: `${name} · Native surface`,
          kind: 'native-surface' as const,
          paneId: `pane-${i}`,
          surfaceUrl: 'https://chatgpt.com/',
        },
        {
          sessionId: `demo-session-${i}-canonical`,
          agentId: `demo-agent-${i}`,
          label: `${name} · Canonical task`,
          kind: 'canonical' as const,
          paneId: `pane-${i}`,
          canonicalUrl: DEMO_CANONICAL_URL,
        },
      ]),
    ],
    n8n: {
      baseUrl: 'http://127.0.0.1:1425/',
      webhookPath: 'webhook/alice',
      health: 'disconnected',
      eventCount: 0,
    },
  }
}
export function createDemoWorkspace(): ProjectsFile {
  const file = structuredClone(EMPTY_PROJECTS_FILE)
  const terminals: Terminal[] = ['GG', 'ARTE', 'ARTE_2'].map((name, i) => ({
    id: `pane-${i}`,
    name,
    customName: true,
    cwd: 'C:\\Projetos\\Alice',
    kind: 'alice-agent-session',
    disabled: false,
    laneVisible: true,
    topbarPinned: true,
    tabs: ['native', 'canonical'].map((mode) => ({
      id: `demo-session-${i}-${mode}`,
      name: `${name} · ${mode}`,
      type: 'shell',
      cwd: 'C:\\Projetos\\Alice',
      ptyId: null,
    })),
    activeTabId: `demo-session-${i}-native`,
  }))
  terminals.push({
    id: 'pane-pty',
    name: 'PTY · Desktop only',
    customName: true,
    cwd: 'C:\\Projetos\\Alice',
    disabled: true,
    laneVisible: true,
    topbarPinned: true,
    tabs: [
      {
        id: 'demo-pty-disabled',
        type: 'codex',
        name: 'Codex CLI · unavailable in browser',
        cwd: 'C:\\Projetos\\Alice',
        ptyId: null,
      },
    ],
    activeTabId: 'demo-pty-disabled',
  })
  const project = {
    id: 'alice-demo',
    name: 'Alice Studio',
    groupId: 'alice-group',
    defaultCwd: 'C:\\Projetos\\Alice',
    terminals,
    layoutMode: 'auto' as const,
    collapsed: false,
    createdAt: 1791360000000,
    color: 'rainbow',
    githubUrl: 'https://github.com/klar690-cmd/Alice',
  }
  const container = {
    projectId: project.id,
    paneIds: terminals.map((p) => p.id),
    size: 100,
    internalLayout: 'auto' as const,
    collapsed: false,
  }
  const snapshot = {
    containers: [container],
    activeProjectId: project.id,
    activeGroupId: null,
    focusedTerminalId: 'pane-0',
    workspaceFlat: false,
    fullscreenContainerId: null,
  }
  file.projects = [project]
  file.groups = [
    {
      id: 'alice-group',
      name: 'Alice',
      color: 'var(--accent)',
      parentGroupId: null,
      projectIds: [project.id],
      collapsed: false,
      suspended: false,
      createdAt: 1791360000000,
    },
  ]
  file.activeProjectId = project.id
  file.workspace = {
    ...file.workspace,
    containers: [container],
    recentProjectIds: [project.id],
    recentTabs: [{ kind: 'project', id: project.id }],
    tabs: [
      {
        id: 'alice-workspace-tab',
        kind: 'project',
        sourceId: project.id,
        label: 'Alice Studio',
        snapshot,
        createdAt: 1791360000000,
        updatedAt: 1791360000000,
      },
    ],
    activeTabId: 'alice-workspace-tab',
    focusedTerminalId: 'pane-0',
  }
  file.preferences = {
    ...file.preferences,
    language: 'pt-BR',
    onboardingDone: true,
    accountCreated: true,
    displayName: '',
    firstLaunchAt: 1791360000000,
    setupWalkthroughHidden: true,
    mcpOnboardingSeen: true,
    topbarShowMemory: false,
    topbarShowClaudeUsage: false,
    topbarShowCodexUsage: false,
    topbarShowAntigravityUsage: false,
    topbarShowSync: false,
    rightSidebarVisible: false,
    enabledFeatures: {
      ...file.preferences.enabledFeatures,
      wsl: false,
      playwright: false,
      aiMemory: false,
      orchestrator: false,
      gsdSync: false,
    },
  }
  return file
}

/** Synthetic links only. No real account or private conversation data in the fixture. */
export function createR219DemoConnections(): AliceConnectionState {
  const state = createDemoConnections()
  state.accounts = state.accounts.map((a) =>
    a.accountId === 'demo-chatgpt-a'
      ? {
          ...a,
          providerId: 'chatgpt-web',
          providerClass: 'web-conversation' as const,
          originalUrl: undefined,
        }
      : a,
  )
  state.accounts.push({
    accountId: 'demo-antigravity',
    providerId: 'antigravity',
    providerClass: 'external-desktop-surface',
    label: 'Antigravity · desktop',
    authMethod: 'none',
    health: 'metadata-only',
  })
  const names = ['GG', 'SOL', 'COSMO']
  state.agents = state.agents.map((a) => {
    const i = ['demo-agent-0', 'demo-agent-1', 'demo-agent-2'].indexOf(a.agentId)
    return i < 0
      ? a
      : {
          ...a,
          displayName: names[i],
          canonicalIdentity: names[i],
          role: i === 2 ? 'Antigravity' : 'ChatGPT',
          accountId: i === 2 ? 'demo-antigravity' : 'demo-chatgpt-a',
          canonicalTaskUrl: undefined,
        }
  })
  state.sessions = state.sessions.map((s) => {
    const i = ['demo-agent-0', 'demo-agent-1', 'demo-agent-2'].indexOf(s.agentId)
    if (i < 0) return s
    return {
      ...s,
      projectId: 'alice-demo',
      providerId: i === 2 ? 'antigravity' : 'chatgpt-web',
      kind:
        s.kind === 'canonical'
          ? ('canonical' as const)
          : i === 2
            ? ('external-desktop' as const)
            : ('web-conversation' as const),
      surfaceUrl:
        s.kind === 'canonical' || i === 2
          ? undefined
          : 'https://chatgpt.com/c/alice-r219-' + names[i].toLowerCase() + '-synthetic',
      canonicalUrl: undefined,
      health: 'configured' as const,
    }
  })
  state.n8n = {
    ...state.n8n,
    baseUrl: 'http://127.0.0.1:5678/',
    health: 'disconnected',
    eventCount: 0,
  }
  return state
}
export function createR219DemoWorkspace(): ProjectsFile {
  const file = createDemoWorkspace(),
    names = ['GG', 'SOL', 'COSMO']
  file.projects[0].terminals.slice(0, 3).forEach((p, i) => {
    p.name = names[i]
    p.tabs.forEach((tab, j) => {
      tab.name = names[i] + ' · ' + (j ? 'canonical' : 'linked')
    })
  })
  return file
}

/** Pane records are available to choose; the initial visible workspace stays empty. */
export function createR222DemoWorkspace(): ProjectsFile {
  const file = createR219DemoWorkspace()
  file.workspace = {
    ...file.workspace,
    containers: [],
    tabs: [],
    activeTabId: null,
    focusedTerminalId: null,
    history: [],
    historyIndex: -1,
    recentTabs: [],
    recentProjectIds: [],
  }
  file.preferences = {
    ...file.preferences,
    displayName: '',
    onboardingDone: false,
    accountCreated: false,
    alwaysStartOnHome: true,
    firstLaunchAt: null,
  }
  return file
}
