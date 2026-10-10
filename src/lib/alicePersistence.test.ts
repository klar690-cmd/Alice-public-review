import { beforeEach, describe, expect, it } from 'vitest'

import { createDemoConnections } from '../preview/data'
import { aliceProfileKey, loadAliceProfile, saveAliceProfile } from './alicePersistence'

describe('Alice profile schema/migration', () => {
  beforeEach(() => localStorage.clear())
  it('migrates legacy only into the original profile, once', () => {
    const state = createDemoConnections()
    state.version = 1
    localStorage.setItem('alice.accounts.v1', JSON.stringify({ state, version: 1 }))
    expect(loadAliceProfile(localStorage, 'second').accounts).toHaveLength(0)
    expect(loadAliceProfile(localStorage, 'default').accounts).toHaveLength(2)
    localStorage.setItem('alice.accounts.v1', 'corrupt')
    expect(loadAliceProfile(localStorage, 'default').version).toBe(2)
    expect(loadAliceProfile(localStorage, 'default').accounts).toHaveLength(2)
  })
  it('isolates IDs/config and browser preview storage', () => {
    const state = createDemoConnections()
    saveAliceProfile(localStorage, 'a', state)
    expect(loadAliceProfile(localStorage, 'b').accounts).toEqual([])
    expect(loadAliceProfile(localStorage, 'a', true).accounts).toEqual([])
    expect(loadAliceProfile(localStorage, 'a').accounts).toEqual(state.accounts)
    expect(aliceProfileKey('a:b')).not.toBe(aliceProfileKey('a/b'))
  })
  it.each([
    '{bad',
    'null',
    '{"version":9}',
    '{"version":2,"accounts":{},"agents":[],"sessions":[],"n8n":{}}',
  ])('safe fallback for %s', (raw) => {
    localStorage.setItem(aliceProfileKey('x'), raw)
    expect(loadAliceProfile(localStorage, 'x').accounts).toEqual([])
  })
  it('does not persist live handles or connector response state', () => {
    const state = createDemoConnections()
    state.sessions[0].ptyId = 'live'
    state.sessions[0].health = 'bound'
    state.n8n.health = 'connected'
    state.n8n.lastResult = { ok: true, status: 200, error: null, attempts: 1 }
    saveAliceProfile(localStorage, 'a', state)
    const loaded = loadAliceProfile(localStorage, 'a')
    expect(loaded.sessions[0].ptyId).toBeUndefined()
    expect(loaded.sessions[0].health).toBe('disconnected')
    expect(loaded.n8n.health).toBe('disconnected')
    expect(loaded.n8n.lastResult).toBeUndefined()
  })
  it('rejects raw secrets and inaccessible storage', () => {
    const state = { ...createDemoConnections(), access_token: 'not-a-reference' }
    expect(saveAliceProfile(localStorage, 'a', state)).toBe(false)
    const denied = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    expect(loadAliceProfile(denied, 'a').accounts).toEqual([])
    expect(saveAliceProfile(denied, 'a', createDemoConnections())).toBe(false)
  })
})
