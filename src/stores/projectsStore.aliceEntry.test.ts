import { beforeEach, describe, expect, it, vi } from 'vitest'

import { needsAliceName } from '../lib/aliceEntry'
import { listProfiles, loadProjectsFile } from '../lib/tauri'
import { createR222DemoWorkspace } from '../preview/data'
import { useProjectsStore } from './projectsStore'
vi.mock('../lib/tauri', async (original) => ({
  ...(await original<object>()),
  listProfiles: vi.fn(),
  loadProjectsFile: vi.fn(),
  recordAppEvent: vi.fn(),
  recordFrontendError: vi.fn(),
}))
beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  const file = createR222DemoWorkspace()
  file.preferences = { ...file.preferences, displayName: 'Profile A', onboardingDone: true }
  useProjectsStore.setState({ ...file, activeProfileId: 'a', hydrated: true })
  vi.mocked(listProfiles).mockResolvedValue({
    active_profile_id: 'b',
    profiles: [{ id: 'b', name: 'Profile B', created_at_ms: 0 }],
  })
})
describe('Alice profile hydration isolation', () => {
  it('missing new profile file never carries previous name/projects/layout', async () => {
    vi.mocked(loadProjectsFile).mockResolvedValue(null)
    await useProjectsStore.getState().hydrate()
    const state = useProjectsStore.getState()
    expect(state.activeProfileId).toBe('b')
    expect(state.preferences.displayName).toBe('')
    expect(state.projects).toEqual([])
    expect(state.workspace.containers).toEqual([])
    expect(needsAliceName(state.preferences)).toBe(true)
  })
  it('corrupt profile file falls back to its own blank Home state', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(loadProjectsFile).mockResolvedValue('{malformed')
    await useProjectsStore.getState().hydrate()
    expect(useProjectsStore.getState().activeProfileId).toBe('b')
    expect(useProjectsStore.getState().preferences.displayName).toBe('')
    expect(useProjectsStore.getState().projects).toEqual([])
    log.mockRestore()
  })
  it('invalid serialized name is sanitized without deleting its valid saved project records', async () => {
    const file = createR222DemoWorkspace()
    file.preferences.displayName = { bad: true } as string
    file.preferences.onboardingDone = true
    vi.mocked(loadProjectsFile).mockResolvedValue(JSON.stringify(file))
    await useProjectsStore.getState().hydrate()
    expect(useProjectsStore.getState().preferences.displayName).toBe('')
    expect(useProjectsStore.getState().projects[0].id).toBe('alice-demo')
    expect(needsAliceName(useProjectsStore.getState().preferences)).toBe(true)
  })
})
