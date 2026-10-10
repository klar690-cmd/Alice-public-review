import { EMPTY_ALICE_STATE, validateAliceState } from './aliceModel'
import type { AliceConnectionState } from './types'

export function aliceProfileKey(profileId: string, preview = false): string {
  return 'alice.' + (preview ? 'preview.' : '') + 'profile.' + encodeURIComponent(profileId) + '.v2'
}
export function persistedAliceState(state: AliceConnectionState): AliceConnectionState {
  validateAliceState(state)
  return {
    version: 2,
    accounts: state.accounts.map((a) => ({
      ...a,
      providerClass:
        a.providerId === 'antigravity' && a.providerClass === 'cli-pty'
          ? 'external-desktop-surface'
          : a.providerClass,
      health: 'metadata-only',
    })),
    agents: state.agents,
    sessions: state.sessions.map((s) => ({
      ...s,
      kind:
        s.kind === 'pty' && (!s.projectId || !s.paneId || !s.tabId || !s.providerId)
          ? 'provider-native'
          : s.kind,
      ptyId: undefined,
      health: 'disconnected',
    })),
    n8n: {
      baseUrl: state.n8n.baseUrl,
      webhookPath: state.n8n.webhookPath ?? 'webhook/alice',
      health: 'disconnected',
      eventCount: state.n8n.eventCount,
    },
  }
}
export function loadAliceProfile(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  profileId: string,
  preview = false,
): AliceConnectionState {
  const key = aliceProfileKey(profileId, preview)
  try {
    const raw = storage.getItem(key)
    if (raw) return persistedAliceState(validateAliceState(JSON.parse(raw)))
    // Migrate app-wide data only into the legacy home profile, once. Never copy it into new profiles.
    const eligible = profileId === (preview ? 'alice-preview' : 'default')
    const legacyKey = preview ? 'alice.preview.accounts.v1' : 'alice.accounts.v1'
    const legacy = eligible && storage.getItem(legacyKey)
    if (legacy) {
      const parsed = JSON.parse(legacy)
      const migrated = persistedAliceState(validateAliceState(parsed.state ?? parsed))
      storage.setItem(key, JSON.stringify(migrated))
      return migrated
    }
  } catch {
    /* Invalid, inaccessible or future data cannot escape its profile. */
  }
  return structuredClone(EMPTY_ALICE_STATE)
}
export function saveAliceProfile(
  storage: Pick<Storage, 'setItem'>,
  profileId: string,
  state: AliceConnectionState,
  preview = false,
): boolean {
  try {
    storage.setItem(aliceProfileKey(profileId, preview), JSON.stringify(persistedAliceState(state)))
    return true
  } catch {
    return false
  }
}
