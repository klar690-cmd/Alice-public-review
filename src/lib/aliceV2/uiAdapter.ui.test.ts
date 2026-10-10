import { describe, expect, it } from 'vitest'

import { activeTeam, createAliceV2UiStore } from '../../stores/aliceV2UiStore'
import { compileGraph } from './compile'
import { simulateGraph } from './fakeExecutor'
import { approveFake, connectDraft, demoGraph, fakeRequest, runProjection } from './uiAdapter'
import { validateGraph } from './validate'

describe('M2 graph adapter', () => {
  it('assembles disconnected agents incrementally without permitting incomplete execution', () => {
    const graph = demoGraph('team', 'Draft'),
      empty = { ...graph, controlEdges: [], dataEdges: [] }
    const store = createAliceV2UiStore()
    store.setState((s) => ({
      teams: s.teams.map((t) => (t.id === s.activeId ? { ...t, graph: empty } : t)),
    }))
    store.getState().connect('GG', 'Dev')
    const partial = activeTeam(store.getState()).graph
    expect(partial.dataEdges).toHaveLength(1)
    expect(() => validateGraph(partial)).toThrow()
    store.getState().prepare()
    expect(activeTeam(store.getState()).run).toBeNull()
    store.getState().connect('Dev', 'Auditor')
    const complete = activeTeam(store.getState()).graph
    expect(validateGraph(complete).dataEdges).toHaveLength(2)
    expect(() => connectDraft(partial, 'Dev', 'GG', 22, 'new')).toThrow()
  })
  it('uses validated fake-only GG → Dev → Auditor contracts', () => {
    const graph = demoGraph('team', 'Example')
    expect(compileGraph(graph).steps.map((s) => s.nodeId)).toEqual(['GG', 'Dev', 'Auditor'])
    expect(graph.nodes.every((n) => n.provider === 'fake' && n.capability === 'fake.message')).toBe(
      true,
    )
  })
  it('rejects cycles transactionally and leaves the original graph frozen', () => {
    const graph = demoGraph('team', 'Example'),
      before = JSON.stringify(graph)
    expect(() => connectDraft(graph, 'Auditor', 'GG', 7, 'new')).toThrow()
    expect(JSON.stringify(graph)).toBe(before)
    expect(Object.isFrozen(graph)).toBe(true)
  })
  it('adds a typed join port without changing the input graph', () => {
    const graph = demoGraph('team', 'Example'),
      joined = connectDraft(graph, 'GG', 'Auditor', 7, 'new')
    expect(joined.dataEdges).toHaveLength(3)
    expect(graph.dataEdges).toHaveLength(2)
    expect(
      joined.nodes
        .find((n) => n.id === 'Auditor')!
        .ports.some((p) => p.id === 'in_1' && p.required),
    ).toBe(true)
    expect(validateGraph(joined)).toEqual(joined)
  })
  it('requires explicit simulated approval and exposes only captured outputs', () => {
    const graph = demoGraph('team', 'Example'),
      input = fakeRequest(graph, 8),
      waiting = simulateGraph(graph, input)
    expect(waiting.status).toBe('waiting-approval')
    expect(
      runProjection({ input, result: waiting, playhead: waiting.checkpoint.events.length })
        .visibleOutputs,
    ).toEqual([])
    const approved = approveFake(input, waiting, 'approved'),
      result = simulateGraph(graph, approved)
    expect(approved.grant?.realAccess).toBe(false)
    expect(result.status).toBe('succeeded')
    expect(runProjection({ input: approved, result, playhead: 0 }).visibleOutputs).toEqual([])
    expect(
      runProjection({ input: approved, result, playhead: result.checkpoint.events.length })
        .visibleOutputs.length,
    ).toBeGreaterThan(0)
  })
  it('denial never yields successful fake messages', () => {
    const graph = demoGraph('team', 'Example'),
      input = fakeRequest(graph, 9),
      waiting = simulateGraph(graph, input)
    const result = simulateGraph(graph, approveFake(input, waiting, 'denied'))
    expect(result.status).toBe('failed')
    expect(result.checkpoint.receipts).toHaveLength(0)
  })
})

describe('M2 in-memory teams and playback', () => {
  it('starts opt-out and exits without deleting the selected conversation', () => {
    const store = createAliceV2UiStore()
    expect(store.getState().enabled).toBe(false)
    store.getState().enter()
    store.getState().send('Plan an example', 'Local sample')
    store.getState().leave()
    expect(store.getState().enabled).toBe(false)
    expect(activeTeam(store.getState()).messages).toHaveLength(2)
  })
  it('isolates profiles, presets, messages, and grants', () => {
    const a = createAliceV2UiStore('profile_a'),
      b = createAliceV2UiStore('profile_b')
    a.getState().send('A request', 'Local A')
    a.getState().selectTeam('team_plan')
    expect(activeTeam(a.getState()).run).toBeNull()
    expect(activeTeam(a.getState()).messages).toHaveLength(0)
    expect(activeTeam(b.getState()).graph.scope.profileId).toBe('profile_b')
    expect(activeTeam(b.getState()).messages).toHaveLength(0)
    a.getState().selectTeam('team_build')
    expect(activeTeam(a.getState()).run?.result.status).toBe('waiting-approval')
  })
  it('saves and restores graph, labels, and layout only within the session', () => {
    const store = createAliceV2UiStore(),
      s = store.getState()
    s.updateNode('Dev', { label: 'Builder', role: 'Developer' })
    s.moveNode('Dev', 410, 210)
    s.save()
    s.updateNode('Dev', { label: 'Other' })
    s.moveNode('Dev', 600, 350)
    s.load()
    const team = activeTeam(store.getState())
    expect(team.labels.Dev.label).toBe('Builder')
    expect(team.layout.Dev).toEqual({ x: 410, y: 210 })
    expect(team.dirty).toBe(false)
    expect(activeTeam(createAliceV2UiStore().getState()).labels.Dev.label).toBe('Dev')
  })
  it('clones a new configuration scope without importing conversations or approval', () => {
    const store = createAliceV2UiStore(),
      s = store.getState()
    s.send('Request', 'Local')
    s.approve('approved')
    s.cloneTeam()
    const team = activeTeam(store.getState())
    expect(team.id).not.toBe('team_build')
    expect(team.graph.nodes.every((n) => n.scope.configId === team.id)).toBe(true)
    expect(team.messages).toHaveLength(0)
    expect(team.run).toBeNull()
  })
  it('keeps the approved graph snapshot immutable after subsequent draft edits', () => {
    const store = createAliceV2UiStore(),
      s = store.getState()
    s.prepare()
    const original = activeTeam(store.getState()).run!
    s.updateNode('GG', { prompt: 'A newer request' })
    s.approve('approved')
    const team = activeTeam(store.getState())
    expect(team.run!.result.snapshot.plan.graphDigest).toBe(
      original.result.snapshot.plan.graphDigest,
    )
    expect(team.run!.result.snapshot.plan.graph.revision).not.toBe(team.graph.revision)
    expect(Object.isFrozen(team.run!.result.snapshot)).toBe(true)
  })
  it('blocks invalid drafts and restores a valid saved team', () => {
    const store = createAliceV2UiStore(),
      s = store.getState()
    s.addNode()
    s.save()
    expect(store.getState().error).not.toBe('')
    s.prepare()
    expect(activeTeam(store.getState()).run).toBeNull()
    s.load()
    expect(validateGraph(activeTeam(store.getState()).graph).nodes).toHaveLength(3)
  })
  it('supports adding, duplicating, and deleting a selected draft agent', () => {
    const store = createAliceV2UiStore(),
      s = store.getState()
    s.addNode()
    const added = store.getState().selectedNode
    s.duplicateNode()
    expect(activeTeam(store.getState()).graph.nodes).toHaveLength(5)
    s.deleteNode()
    expect(activeTeam(store.getState()).graph.nodes.some((n) => n.id === added)).toBe(true)
    expect(activeTeam(store.getState()).graph.nodes).toHaveLength(4)
  })
  it('does not accept an invalid link and exposes a validation error', () => {
    const store = createAliceV2UiStore(),
      s = store.getState(),
      before = activeTeam(store.getState()).graph
    s.connect('Auditor', 'GG', 'new')
    expect(store.getState().error).toBe('CYCLE')
    expect(activeTeam(store.getState()).graph).toBe(before)
  })
  it('bounds canvas and replay progression and does not duplicate completion replies', () => {
    const store = createAliceV2UiStore(),
      s = store.getState()
    s.setViewport(200, { x: 99999, y: -99999 })
    expect(store.getState().zoom).toBe(1.6)
    s.prepare()
    s.approve('approved')
    s.finish('Finished')
    s.finish('Finished')
    const team = activeTeam(store.getState())
    expect(team.run!.playhead).toBe(team.run!.result.checkpoint.events.length)
    expect(team.messages).toHaveLength(1)
    s.advance()
    expect(activeTeam(store.getState()).run!.playhead).toBe(team.run!.playhead)
  })
})
