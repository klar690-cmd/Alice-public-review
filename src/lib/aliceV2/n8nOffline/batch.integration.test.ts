// @vitest-environment node
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { OFFLINE } from '../offlineAdapters/contracts'
import { frame } from '../offlineAdapters/fixtures'
import { OfflineCoordinator } from '../offlineCoordinator/coordinator'
import { authorization, demoGraph, demoRun } from '../offlineCoordinator/fixtures'
import {
  compileOfflineIR,
  initialCallbackLedger,
  serializeOfflineIR,
  validateCallbackFixture,
} from './ir'

describe('R262 A/B/C integrated offline batch', () => {
  it('replays the entire chain and verifies correlated offline callback fixtures', () => {
    const run = demoRun(),
      ir = compileOfflineIR(demoGraph())
    let ledger = initialCallbackLedger(ir)
    for (const event of run.trace.filter((e) => e.kind === 'handoff')) {
      const cursor = ledger.cursors.find((c) => c.nodeId === event.scope.nodeId)!
      ledger = validateCallbackFixture(
        ir,
        {
          marker: OFFLINE,
          format: 'alice.n8n.callback-fixture.v1',
          scope: event.scope,
          sequence: cursor.cursor + 1,
          event: 'mock.completed',
          proof: 'NONE_OFFLINE_UNTRUSTED',
        },
        ledger,
      ).nextLedger
    }
    expect(run.status).toBe('completed')
    expect(ledger.cursors.map((c) => c.cursor)).toEqual([1, 1, 0])
    expect(JSON.stringify({ run, ir, ledger })).not.toMatch(
      /authref:|authRef|sessionRef|Bearer |https:|accessToken/,
    )
    expect(ir.executable).toBe(false)
    writeFileSync(
      'docs/alice/v2/m3bc/FIXTURE_CHAIN.json',
      JSON.stringify(
        { marker: OFFLINE, executedAgainstProviders: false, run, ir, ledger },
        null,
        2,
      ),
    )
    writeFileSync('docs/alice/v2/m3bc/FIXTURE_N8N_IR.json', serializeOfflineIR(ir))
  })
  it('a malicious provider event leaves the coordinator and export unchanged', () => {
    const coordinator = new OfflineCoordinator(demoGraph()),
      ir = compileOfflineIR(demoGraph())
    coordinator.start('gg', 'start', authorization(coordinator, 'gg', 'n'))
    const before = coordinator.snapshot(),
      serialized = serializeOfflineIR(ir)
    expect(() =>
      coordinator.ingest(
        'gg',
        frame(coordinator.scope('gg'), 3, 'item/agentMessage/delta', { text: 'Bearer malicious' }),
      ),
    ).toThrow('SECRET_MATERIAL')
    expect(coordinator.snapshot()).toEqual(before)
    expect(serializeOfflineIR(ir)).toBe(serialized)
  })
  it('project B cannot hand off into project A via events or callbacks', () => {
    const a = new OfflineCoordinator(demoGraph()),
      b = new OfflineCoordinator({ ...demoGraph(), projectId: 'projectB' }),
      ir = compileOfflineIR(demoGraph())
    a.start('gg', 'start', authorization(a, 'gg', 'a'))
    b.start('gg', 'start', authorization(b, 'gg', 'b'))
    expect(() =>
      a.ingest('gg', frame(b.scope('gg'), 3, 'turn/completed', { text: 'Foreign handoff' })),
    ).toThrow('FOREIGN_EVENT_SCOPE')
    expect(() =>
      validateCallbackFixture(
        ir,
        {
          marker: OFFLINE,
          format: 'alice.n8n.callback-fixture.v1',
          scope: b.scope('gg'),
          sequence: 1,
          event: 'mock.completed',
          proof: 'NONE_OFFLINE_UNTRUSTED',
        },
        initialCallbackLedger(ir),
      ),
    ).toThrow('FOREIGN_CALLBACK_SCOPE')
  })
  it('missing grants and unknown budgets produce no simulated calls', () => {
    const c = new OfflineCoordinator(demoGraph()),
      unknown = new OfflineCoordinator({ ...demoGraph(), budgetUnits: null })
    expect(() => c.start('gg', 'no', { ...authorization(c, 'gg', 'n'), grant: null })).toThrow(
      'NO_GRANT',
    )
    expect(() => unknown.start('gg', 'unknown', authorization(unknown, 'gg', 'n'))).toThrow(
      'UNKNOWN_BUDGET',
    )
    expect(c.snapshot().trace).toHaveLength(0)
    expect(unknown.snapshot().trace).toHaveLength(0)
    expect(() => compileOfflineIR(unknown.graph)).toThrow('UNKNOWN_BUDGET')
  })
  it('new production modules contain no runtime, credential or network entrypoints', () => {
    for (const folder of ['offlineAdapters', 'offlineCoordinator', 'n8nOffline']) {
      for (const name of readdirSync(`src/lib/aliceV2/${folder}`).filter(
        (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'),
      )) {
        const source = readFileSync(`src/lib/aliceV2/${folder}/${name}`, 'utf8')
        expect(source).not.toMatch(
          /fetch\s*\(|invoke\s*\(|spawn\s*\(|exec\s*\(|localStorage|keyring|process\.env|@tauri|https?:\/\//,
        )
        expect(source).not.toMatch(/executable:\s*true|deployable:\s*true|ready:\s*true/)
      }
    }
  })
  it('M1/M2 and M3a realness and Claude guards remain in their original files', () => {
    expect(readFileSync('src/lib/aliceV2/contracts.ts', 'utf8')).toContain('realAccess: false')
    expect(readFileSync('src/lib/aliceV2/compile.ts', 'utf8')).toContain('executable: false')
    expect(readFileSync('src/lib/aliceV2/livePlan.ts', 'utf8')).toContain(
      'BLOCKED_UNSUPPORTED_CLAUDE_PERMISSION_CHANNEL',
    )
    expect(readFileSync('src-tauri/src/alice_v2_policy.rs', 'utf8')).toContain(
      'BLOCKED_UNSUPPORTED_CLAUDE_PERMISSION_CHANNEL',
    )
  })
})
