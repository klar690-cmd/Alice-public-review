import { createStore } from 'zustand/vanilla'

import { DomainError, type GraphDocument, immutable } from '../lib/aliceV2/contracts'
import { simulateGraph } from '../lib/aliceV2/fakeExecutor'
import {
  defaultProviderSelection,
  type ProviderUiSettings,
  type UiScope,
  updateProviderSelection,
  validateProviderSelection,
} from '../lib/aliceV2/providerUiOptions'
import { prepareAgentRunIntent } from '../lib/aliceV2/runIntentBridge'
import {
  approveFake,
  connectDraft,
  defaultDemoCopy,
  type DemoCopy,
  demoGraph,
  fakeRequest,
  initialLabels,
  initialLayout,
  type Layout,
  type NodeLabel,
  type UiRun,
} from '../lib/aliceV2/uiAdapter'
import { validateGraph } from '../lib/aliceV2/validate'

export type View = 'chat' | 'editor' | 'teams' | 'monitor' | 'accounts'
export type ChatLine = Readonly<{ id: number; kind: 'user' | 'gg'; text: string }>
export type Team = Readonly<{
  id: string
  graph: GraphDocument
  savedGraph: GraphDocument
  layout: Layout
  savedLayout: Layout
  labels: Readonly<Record<string, NodeLabel>>
  savedLabels: Readonly<Record<string, NodeLabel>>
  providerSettings: ProviderUiSettings
  savedProviderSettings: ProviderUiSettings
  messages: readonly ChatLine[]
  run: UiRun | null
  dirty: boolean
}>
export type M2State = {
  enabled: boolean
  view: View
  teams: readonly Team[]
  activeId: string
  selectedNode: string | null
  projectId: string
  updateProvider: (id: string, patch: unknown) => void
  linkFrom: string | null
  error: string
  notice: 'saved' | 'loaded' | null
  zoom: number
  pan: { x: number; y: number }
  serial: number
  enter: () => void
  leave: () => void
  setView: (view: View) => void
  selectTeam: (id: string) => void
  selectNode: (id: string) => void
  moveNode: (id: string, x: number, y: number) => void
  updateNode: (
    id: string,
    patch: { label?: string; role?: string; prompt?: string; behavior?: 'produce' | 'review' },
  ) => void
  addNode: () => void
  duplicateNode: () => void
  deleteNode: () => void
  connect: (from: string, to: string, port?: string) => void
  deleteEdge: (edgeId: string) => void
  save: () => void
  load: () => void
  cloneTeam: () => void
  renameTeam: (name: string) => void
  send: (message: string, reply: string) => void
  prepare: () => void
  approve: (decision: 'approved' | 'denied') => void
  advance: () => void
  finish: (reply: string) => void
  setViewport: (zoom: number, pan: { x: number; y: number }) => void
  setLinkFrom: (id: string | null) => void
  clearError: () => void
}
export const activeTeam = (state: M2State): Team =>
  state.teams.find((t) => t.id === state.activeId)!
/** Read-only intent projection; no ledger consumption, grant, store update or launch. */
export function selectAgentRunIntent(
  state: M2State,
  nodeId: string,
  request: unknown,
  previousSequence: number,
  spentIntentIds: readonly string[],
) {
  const team = state.teams.find((t) => t.id === state.activeId),
    node = team?.graph.nodes.find((n) => n.id === nodeId)
  return prepareAgentRunIntent(
    team?.providerSettings[nodeId],
    node
      ? {
          scope: { ...team!.graph.scope, projectId: state.projectId, nodeId: node.id },
          role: team!.labels[node.id]?.kind,
          graphSchemaVersion: team!.graph.schemaVersion,
          graphRevision: team!.graph.revision,
          previousSequence,
          spentIntentIds,
        }
      : null,
    request,
  )
}
const uiScope = (graph: GraphDocument, nodeId: string, projectId: string): UiScope => ({
  ...graph.scope,
  projectId,
  nodeId,
})
const remapSettings = (
  settings: ProviderUiSettings,
  graph: GraphDocument,
  projectId: string,
  allowScopeRemap = false,
): ProviderUiSettings =>
  immutable(
    Object.fromEntries(
      graph.nodes.map((node) => {
        const scope = uiScope(graph, node.id, projectId)
        const existing = settings[node.id]
        return [
          node.id,
          existing
            ? validateProviderSelection(allowScopeRemap ? { ...existing, scope } : existing, scope)
            : defaultProviderSelection(scope),
        ]
      }),
    ),
  )
const seed = (
  id: string,
  name: string,
  profileId: string,
  copy: DemoCopy,
  projectId: string,
): Team => {
  const graph = demoGraph(id, name, profileId, copy),
    layout = initialLayout(),
    labels = initialLabels()
  return {
    id,
    graph,
    savedGraph: graph,
    layout,
    savedLayout: layout,
    labels,
    savedLabels: labels,
    providerSettings: remapSettings({}, graph, projectId),
    savedProviderSettings: remapSettings({}, graph, projectId),
    messages: [],
    run: null,
    dirty: false,
  }
}
export function createAliceV2UiStore(
  profileId = 'm2_session',
  copy: DemoCopy = defaultDemoCopy,
  projectId = 'm2_demo',
) {
  return createStore<M2State>((set, get) => {
    const update = (fn: (team: Team) => Team) =>
      set((s) => ({
        teams: s.teams.map((t) => (t.id === s.activeId ? fn(t) : t)),
        notice: null,
        error: '',
      }))
    const error = (e: unknown) =>
      set({
        error: e instanceof DomainError ? e.code : e instanceof Error ? e.message : 'MALFORMED',
      })
    const prepare = () => {
      const s = get(),
        team = activeTeam(s)
      try {
        const graph = validateGraph(team.graph),
          input = fakeRequest(graph, s.serial + 1),
          result = simulateGraph(graph, input)
        update((t) => ({ ...t, run: { input, result, playhead: result.checkpoint.events.length } }))
        set({ serial: s.serial + 1, view: 'chat' })
      } catch (e) {
        error(e)
      }
    }
    const edit = (fn: (team: Team) => Partial<Team>) =>
      update((t) => ({ ...t, ...fn(t), dirty: true }))
    return {
      projectId,
      updateProvider: (id, patch) => {
        try {
          const team = activeTeam(get())
          if (!team.graph.nodes.some((n) => n.id === id)) throw new Error('UNKNOWN_NODE')
          const scope = uiScope(team.graph, id, projectId),
            current = team.providerSettings[id] ?? defaultProviderSelection(scope),
            next = updateProviderSelection(current, patch, scope)
          edit((t) => ({ providerSettings: immutable({ ...t.providerSettings, [id]: next }) }))
        } catch (e) {
          error(e)
        }
      },
      enabled: false,
      view: 'chat',
      teams: [
        seed('team_build', copy.names[0], profileId, copy, projectId),
        seed('team_plan', copy.names[1], profileId, copy, projectId),
      ],
      activeId: 'team_build',
      selectedNode: 'GG',
      linkFrom: null,
      error: '',
      notice: null,
      zoom: 0.8,
      pan: { x: 10, y: 0 },
      serial: 2,
      enter: () => set({ enabled: true }),
      leave: () => set({ enabled: false }),
      setView: (view) => set({ view, error: '', linkFrom: null }),
      clearError: () => set({ error: '' }),
      setLinkFrom: (linkFrom) => set({ linkFrom }),
      selectTeam: (id) => {
        if (get().teams.some((t) => t.id === id))
          set({ activeId: id, selectedNode: 'GG', error: '', linkFrom: null, notice: null })
      },
      selectNode: (id) => set({ selectedNode: id, error: '' }),
      moveNode: (id, x, y) =>
        edit((t) => ({
          layout: {
            ...t.layout,
            [id]: { x: Math.max(0, Math.min(1700, x)), y: Math.max(30, Math.min(1000, y)) },
          },
        })),
      updateNode: (id, patch) => {
        if (patch.label !== undefined && (!patch.label.trim() || patch.label.length > 60)) {
          set({ error: 'MALFORMED' })
          return
        }
        edit((t) => ({
          labels:
            patch.label === undefined
              ? t.labels
              : { ...t.labels, [id]: { ...t.labels[id], label: patch.label } },
          graph: {
            ...t.graph,
            revision: t.graph.revision + 1,
            nodes: t.graph.nodes.map((n) =>
              n.id === id
                ? {
                    ...n,
                    ...(patch.role !== undefined ? { role: patch.role } : {}),
                    ...(patch.prompt !== undefined ? { prompt: patch.prompt } : {}),
                    ...(patch.behavior
                      ? {
                          behavior: patch.behavior,
                          ports:
                            patch.behavior === 'review' &&
                            !n.ports.some((p) => p.direction === 'input')
                              ? [
                                  ...n.ports,
                                  {
                                    id: 'in',
                                    direction: 'input',
                                    schema: 'message.v1',
                                    required: true,
                                  },
                                ]
                              : n.ports.map((p) =>
                                  p.direction === 'input'
                                    ? { ...p, required: patch.behavior === 'review' }
                                    : p,
                                ),
                        }
                      : {}),
                  }
                : n,
            ),
          },
        }))
      },
      addNode: () => {
        if (activeTeam(get()).graph.nodes.length >= 12) {
          set({ error: 'MALFORMED' })
          return
        }
        const s = get(),
          id = `agent_${s.serial + 1}`
        edit((t) => ({
          graph: {
            ...t.graph,
            revision: t.graph.revision + 1,
            nodes: [
              ...t.graph.nodes,
              {
                id,
                kind: 'agent',
                scope: t.graph.scope,
                provider: 'fake',
                capability: 'fake.message',
                behavior: 'review',
                role: copy.roles[2],
                prompt: copy.newPrompt,
                join: 'all',
                ports: [
                  { id: 'in', direction: 'input', schema: 'message.v1', required: true },
                  { id: 'out', direction: 'output', schema: 'message.v1', required: false },
                ],
              },
            ],
          },
          labels: {
            ...t.labels,
            [id]: { label: `${copy.newAgent} ${s.serial + 1}`, kind: 'reviewer' },
          },
          layout: { ...t.layout, [id]: { x: 430, y: 390 } },
        }))
        update((t) => ({
          ...t,
          providerSettings: remapSettings(t.providerSettings, t.graph, projectId),
        }))
        set({ serial: s.serial + 1, selectedNode: id, view: 'editor' })
      },
      duplicateNode: () => {
        if (activeTeam(get()).graph.nodes.length >= 12) {
          set({ error: 'MALFORMED' })
          return
        }
        const s = get(),
          t = activeTeam(s),
          n = t.graph.nodes.find((n) => n.id === s.selectedNode)
        if (!n) return
        const id = `agent_${s.serial + 1}`
        edit((t) => ({
          graph: {
            ...t.graph,
            revision: t.graph.revision + 1,
            nodes: [...t.graph.nodes, { ...n, id }],
          },
          labels: {
            ...t.labels,
            [id]: { ...t.labels[n.id], label: t.labels[n.id].label + ' ' + copy.copy },
          },
          layout: { ...t.layout, [id]: { x: t.layout[n.id].x + 35, y: t.layout[n.id].y + 210 } },
        }))
        update((t) => ({
          ...t,
          providerSettings: remapSettings(
            {
              ...t.providerSettings,
              [id]: { ...t.providerSettings[n.id], scope: uiScope(t.graph, id, projectId) },
            },
            t.graph,
            projectId,
          ),
        }))
        set({ serial: s.serial + 1, selectedNode: id })
      },
      deleteNode: () => {
        const id = get().selectedNode
        if (!id) return
        edit((t) => ({
          graph: {
            ...t.graph,
            revision: t.graph.revision + 1,
            nodes: t.graph.nodes.filter((n) => n.id !== id),
            controlEdges: t.graph.controlEdges.filter((e) => e.from !== id && e.to !== id),
            dataEdges: t.graph.dataEdges.filter((e) => e.from.nodeId !== id && e.to.nodeId !== id),
          },
        }))
        update((t) => ({
          ...t,
          providerSettings: remapSettings(t.providerSettings, t.graph, projectId),
        }))
        set({ selectedNode: null, linkFrom: null })
      },
      connect: (from, to, port = 'in') => {
        const s = get()
        try {
          const graph = activeTeam(s).graph
          let next: GraphDocument
          try {
            next = connectDraft(graph, from, to, s.serial + 1, port)
          } catch (issue) {
            if (!(issue instanceof DomainError) || issue.code !== 'MISSING_INPUT') throw issue
            // UI assembly accepts incomplete inputs, but retains all structural M1 checks and original requirements.
            const relaxed = {
              ...graph,
              nodes: graph.nodes.map((n) => ({
                ...n,
                ports: n.ports.map((p) => ({ ...p, required: false })),
              })),
            }
            const wired = connectDraft(relaxed, from, to, s.serial + 1, port)
            next = immutable({
              ...wired,
              nodes: wired.nodes.map((n) => ({
                ...n,
                ports: n.ports.map((p) => ({
                  ...p,
                  required:
                    graph.nodes
                      .find((original) => original.id === n.id)
                      ?.ports.find((original) => original.id === p.id)?.required ?? p.required,
                })),
              })),
            })
          }
          edit(() => ({ graph: next }))
          set({ serial: s.serial + 1, linkFrom: null })
        } catch (e) {
          error(e)
        }
      },
      deleteEdge: (edgeId) =>
        edit((t) => {
          const e = t.graph.dataEdges.find((e) => e.id === edgeId)
          return {
            graph: {
              ...t.graph,
              revision: t.graph.revision + 1,
              dataEdges: t.graph.dataEdges.filter((e) => e.id !== edgeId),
              controlEdges: e
                ? t.graph.controlEdges.filter(
                    (c) => !(c.from === e.from.nodeId && c.to === e.to.nodeId),
                  )
                : t.graph.controlEdges,
            },
          }
        }),
      save: () => {
        try {
          const t = activeTeam(get()),
            graph = validateGraph(t.graph)
          update((t) => ({
            ...t,
            savedGraph: graph,
            savedLayout: immutable(t.layout),
            savedLabels: immutable(t.labels),
            savedProviderSettings: remapSettings(t.providerSettings, graph, projectId),
            dirty: false,
          }))
          set({ notice: 'saved' })
        } catch (e) {
          error(e)
        }
      },
      load: () => {
        update((t) => ({
          ...t,
          graph: t.savedGraph,
          layout: t.savedLayout,
          labels: t.savedLabels,
          providerSettings: t.savedProviderSettings,
          dirty: false,
        }))
        set({ notice: 'loaded', selectedNode: 'GG' })
      },
      renameTeam: (name) => {
        if (!name.trim() || name.length > 120) {
          set({ error: 'MALFORMED' })
          return
        }
        edit((t) => ({ graph: { ...t.graph, name, revision: t.graph.revision + 1 } }))
      },
      cloneTeam: () => {
        if (get().teams.length >= 12) {
          set({ error: 'MALFORMED' })
          return
        }
        try {
          const s = get(),
            t = activeTeam(s),
            id = `team_${s.serial + 1}`,
            scope = { ...t.graph.scope, configId: id },
            graph = validateGraph({
              ...t.graph,
              scope,
              name: t.graph.name + ' ' + copy.copy,
              revision: 1,
              nodes: t.graph.nodes.map((n) => ({ ...n, scope })),
            })
          const clonedTeam: Team = {
            ...t,
            id,
            graph,
            savedGraph: graph,
            savedLayout: immutable(t.layout),
            savedLabels: immutable(t.labels),
            providerSettings: remapSettings(t.providerSettings, graph, projectId, true),
            savedProviderSettings: remapSettings(t.providerSettings, graph, projectId, true),
            messages: [],
            run: null,
            dirty: false,
          }
          set({
            teams: [...s.teams, clonedTeam],
            activeId: id,
            serial: s.serial + 1,
            notice: null,
            error: '',
          })
        } catch (e) {
          error(e)
        }
      },
      send: (message, reply) => {
        const text = message.trim()
        if (!text || text.length > 1200) return
        edit((t) => ({
          graph: {
            ...t.graph,
            revision: t.graph.revision + 1,
            nodes: t.graph.nodes.map((n) => (n.id === 'GG' ? { ...n, prompt: text } : n)),
          },
          messages: [
            ...t.messages,
            { id: t.messages.length + 1, kind: 'user', text },
            { id: t.messages.length + 2, kind: 'gg', text: reply },
          ],
        }))
        prepare()
      },
      prepare,
      approve: (decision) => {
        const t = activeTeam(get())
        if (!t.run || t.run.result.status !== 'waiting-approval') return
        try {
          const input = approveFake(t.run.input, t.run.result, decision),
            result = simulateGraph(t.run.result.snapshot.plan.graph, input)
          update((t) => ({
            ...t,
            run: {
              input,
              result,
              playhead:
                decision === 'denied'
                  ? result.checkpoint.events.length
                  : Math.min(
                      result.checkpoint.events.length,
                      t.run!.result.checkpoint.events.length + 2,
                    ),
            },
          }))
        } catch (e) {
          error(e)
        }
      },
      advance: () =>
        update((t) =>
          t.run
            ? {
                ...t,
                run: {
                  ...t.run,
                  playhead: Math.min(t.run.playhead + 1, t.run.result.checkpoint.events.length),
                },
              }
            : t,
        ),
      finish: (reply) =>
        update((t) =>
          t.run && t.run.playhead < t.run.result.checkpoint.events.length
            ? {
                ...t,
                run: { ...t.run, playhead: t.run.result.checkpoint.events.length },
                messages: [...t.messages, { id: t.messages.length + 1, kind: 'gg', text: reply }],
              }
            : t,
        ),
      setViewport: (zoom, pan) =>
        set({
          zoom: Math.max(0.35, Math.min(1.6, zoom)),
          pan: {
            x: Math.max(-1200, Math.min(1000, pan.x)),
            y: Math.max(-800, Math.min(500, pan.y)),
          },
        }),
    }
  })
}
export type M2Store = ReturnType<typeof createAliceV2UiStore>
