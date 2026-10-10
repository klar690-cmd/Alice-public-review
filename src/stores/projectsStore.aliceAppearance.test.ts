import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listProfiles, loadProjectsFile, saveProjectsFile } from '../lib/tauri'
import { createR222DemoWorkspace } from '../preview/data'
import { flushProjectsState, useProjectsStore } from './projectsStore'

vi.mock('../lib/tauri', async (original) => ({
  ...(await original<object>()),
  listProfiles: vi.fn(),
  loadProjectsFile: vi.fn(),
  saveProjectsFile: vi.fn(),
  recordAppEvent: vi.fn(),
  recordFrontendError: vi.fn(),
}))
let active = 'a'
const files = new Map<string, string>()
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  files.clear()
  active = 'a'
  files.set('a', JSON.stringify(createR222DemoWorkspace()))
  vi.mocked(listProfiles).mockImplementation(async () => ({
    active_profile_id: active,
    profiles: [
      { id: 'a', name: 'A', created_at_ms: 0 },
      { id: 'b', name: 'B', created_at_ms: 0 },
    ],
  }))
  vi.mocked(loadProjectsFile).mockImplementation(async () => files.get(active) ?? null)
  vi.mocked(saveProjectsFile).mockImplementation(async (raw) => {
    files.set(active, raw)
  })
})
describe('R224 uses existing profile appearance persistence', () => {
  it('saves and reloads choice in the existing projects.json with all session and workspace records intact', async () => {
    await useProjectsStore.getState().hydrate()
    const before = structuredClone(useProjectsStore.getState().projects)
    useProjectsStore.getState().setUiTheme('cream-rose')
    await flushProjectsState()
    expect(JSON.parse(files.get('a')!).preferences.uiTheme).toBe('cream-rose')
    await useProjectsStore.getState().hydrate()
    expect(useProjectsStore.getState().preferences.uiTheme).toBe('cream-rose')
    expect(useProjectsStore.getState().projects).toEqual(before)
  })
  it('switches profiles without copying the previous theme and restores each choice', async () => {
    await useProjectsStore.getState().hydrate()
    useProjectsStore.getState().setUiTheme('cream-rose')
    await flushProjectsState()
    active = 'b'
    await useProjectsStore.getState().hydrate()
    expect(useProjectsStore.getState().preferences.uiTheme).toBe('elite-indigo')
    useProjectsStore.getState().setUiTheme('dark')
    await flushProjectsState()
    active = 'a'
    await useProjectsStore.getState().hydrate()
    expect(useProjectsStore.getState().preferences.uiTheme).toBe('cream-rose')
    active = 'b'
    await useProjectsStore.getState().hydrate()
    expect(useProjectsStore.getState().preferences.uiTheme).toBe('dark')
  })
  it('normalizes malformed theme types without discarding otherwise valid projects', async () => {
    const file = createR222DemoWorkspace()
    file.preferences.uiTheme = { bad: true } as unknown as string
    file.preferences.terminalTheme = 42 as unknown as string
    files.set('a', JSON.stringify(file))
    await useProjectsStore.getState().hydrate()
    expect(useProjectsStore.getState().preferences.uiTheme).toBe('elite-indigo')
    expect(useProjectsStore.getState().preferences.terminalTheme).toBe('elite-indigo')
    expect(useProjectsStore.getState().projects[0].id).toBe('alice-demo')
  })
})
