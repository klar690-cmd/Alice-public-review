import { aliceProfileKey } from '../lib/alicePersistence'
import type { ProfileMeta } from '../lib/tauri/profiles'
import { EMPTY_PROJECTS_FILE } from '../lib/types'
import { useUiStore } from '../stores/uiStore'
import canonicalFixture from './canonical-r222.json'
import { createR222DemoWorkspace } from './data'

type Args = Record<string, unknown>
const legacyKey = 'alice.preview.workspace.v1'
const profilesKey = 'alice.preview.profiles.v2'
function profileState(): { active_profile_id: string; profiles: ProfileMeta[] } {
  try {
    const parsed = JSON.parse(localStorage.getItem(profilesKey) ?? 'null')
    if (
      parsed?.profiles?.length &&
      parsed.profiles.some((p: ProfileMeta) => p.id === parsed.active_profile_id)
    )
      return parsed
  } catch {
    /* preview storage fallback */
  }
  return { active_profile_id: profile.id, profiles: [profile] }
}
function workspaceKey(): string {
  return profileState().active_profile_id === 'alice-preview'
    ? legacyKey
    : 'alice.preview.workspace.' + profileState().active_profile_id + '.v1'
}
const callbacks = new Map<number, (value: unknown) => void>()
let nextId = 1
function storedWorkspace(): string {
  try {
    const saved = localStorage.getItem(workspaceKey())
    if (saved) return saved
  } catch {
    /* file:// may deny storage */
  }
  const id = profileState().active_profile_id
  return JSON.stringify(
    id === 'alice-preview'
      ? createR222DemoWorkspace()
      : {
          ...structuredClone(EMPTY_PROJECTS_FILE),
          preferences: {
            ...EMPTY_PROJECTS_FILE.preferences,
            language: 'pt-BR',
            onboardingDone: false,
            accountCreated: false,
            alwaysStartOnHome: true,
          },
        },
  )
}
const profile = {
  id: 'alice-preview',
  name: 'Alice Preview · demo',
  created_at_ms: 1791360000000,
  last_used_at_ms: 1791360000000,
}
export async function previewInvoke(command: string, args: Args = {}): Promise<unknown> {
  if (command.startsWith('record_')) return undefined
  if (command === 'list_profiles') return profileState()
  if (command === 'get_active_profile')
    return profileState().profiles.find((p) => p.id === profileState().active_profile_id)
  if (command === 'create_profile') {
    const state = profileState()
    state.profiles.push({
      ...profile,
      id: crypto.randomUUID(),
      name: String(args.name ?? 'Profile'),
      created_at_ms: Date.now(),
    })
    localStorage.setItem(profilesKey, JSON.stringify(state))
    return state
  }
  if (command === 'set_active_profile') {
    const state = profileState()
    if (!state.profiles.some((p) => p.id === args.profileId)) throw new Error('invalid profile')
    state.active_profile_id = String(args.profileId)
    localStorage.setItem(profilesKey, JSON.stringify(state))
    return state
  }
  if (command === 'alice_github_read') {
    const fixture = canonicalFixture as Record<string, string>
    const value = fixture[String(args.reference) + ':' + String(args.path)]
    if (value === undefined) throw new Error('fixture unavailable')
    return value
  }
  if (command === 'list_profile_summaries')
    return profileState().profiles.map((p) => ({
      ...p,
      profile_image_url: '',
      project_count: p.id === 'alice-preview' ? 1 : 0,
      terminal_count: p.id === 'alice-preview' ? 4 : 0,
      is_active: p.id === profileState().active_profile_id,
    }))
  if (command === 'load_projects') return storedWorkspace()
  if (command === 'save_projects') {
    try {
      localStorage.setItem(workspaceKey(), String(args.content))
    } catch {
      /* demonstration remains in memory */
    }
    return undefined
  }
  if (
    command === 'plugins_disabled' ||
    command === 'plugins_list' ||
    command === 'get_active_sessions'
  )
    return []
  if (command === 'plugin_storage_get') return {}
  if (command === 'plugin_storage_read')
    return localStorage.getItem(`alice.preview.plugin.${args.id}`)
  if (command === 'plugin_storage_write') {
    const storageKey = `alice.preview.plugin.${args.id}`
    if (args.body === null) localStorage.removeItem(storageKey)
    else localStorage.setItem(storageKey, String(args.body))
    return undefined
  }
  // Browser-local configuration only. No planner or remote listener exists here.
  if (command === 'orchestrator_default_rule_sets') return []
  if (command === 'orchestrator_set_rule_sets' || command === 'orchestrator_apply_settings')
    return undefined
  if (command === 'remote_control_set_enabled' && args.enabled === false)
    return {
      enabled: false,
      connected_devices: 0,
      online_devices: 0,
      max_devices: 0,
      session_expiry_secs: 0,
      read_only: true,
      allow_shell_input: false,
      reach_mode: 'lan',
      pairing_open: false,
      pairing_expires_in: 0,
      devices: [],
      pairing_url: null,
      qr_svg: null,
      http_url: null,
      ws_url: null,
    }
  if (
    command === 'plugin_storage_set' ||
    command === 'plugin_storage_remove' ||
    command === 'plugin_storage_clear'
  )
    return undefined
  if (command.startsWith('plugin:event|')) return command.endsWith('listen') ? nextId++ : undefined
  if (command.startsWith('plugin:window|') || command.startsWith('plugin:webview|')) {
    if (command.includes('is_')) return false
    if (command.includes('inner_size') || command.includes('outer_size'))
      return { width: window.innerWidth, height: window.innerHeight }
    if (command.includes('position')) return { x: 0, y: 0 }
    if (command.includes('scale_factor')) return window.devicePixelRatio
    if (command.includes('get_all')) return []
    return undefined
  }
  if (command.startsWith('plugin:image|'))
    return command.endsWith('size') ? { width: 32, height: 32 } : 1
  if (command === 'plugin:resources|close') return undefined
  if (command === 'plugin:updater|check') return null
  if (
    [
      'ghostty_kill_all',
      'set_max_concurrent_spawns',
      'set_wsl_integration_enabled',
      'set_window_opacity',
      'set_discord_presence',
      'clear_discord_presence',
    ].includes(command)
  )
    return undefined
  if (command === 'get_platform') return 'windows'
  if (command === 'plugin:app|version' || command === 'get_app_version') return '1.7.0-alice.1'
  // No wildcard success for PTY, credentials, filesystem, webhooks or unsupported native work.
  throw new Error(`Alice browser preview: native operation unavailable (${command})`)
}
export function installAlicePreviewBridge(): void {
  const target = window as unknown as Record<string, unknown>
  target.__TAURI_INTERNALS__ = {
    invoke: previewInvoke,
    metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
    convertFileSrc: () => '',
    transformCallback: (callback: (value: unknown) => void) => {
      const id = nextId++
      callbacks.set(id, callback)
      return id
    },
    unregisterCallback: (id: number) => callbacks.delete(id),
  }
  target.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => undefined }
  useUiStore.setState({ activeView: 'home', leftSidebarTab: 'projects' })
}
export function restoreAlicePreview(): void {
  try {
    localStorage.removeItem(legacyKey)
    localStorage.removeItem(aliceProfileKey('alice-preview', true))
    localStorage.removeItem(profilesKey)
    localStorage.removeItem('alice.preview.accounts.v1')
  } catch {
    /* optional persistence */
  }
  location.reload()
}
