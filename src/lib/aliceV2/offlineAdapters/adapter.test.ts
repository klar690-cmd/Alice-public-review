// @vitest-environment node
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { OfflineAdapter } from './adapter'
import { capabilities } from './contracts'
import { fixtureScope, frame, successTranscript } from './fixtures'

describe('A offline transcript adapters', () => {
  it('bounds transcript memory without changing state on overflow', () => {
    const scope = fixtureScope(),
      adapter = new OfflineAdapter(scope)
    successTranscript(scope)
      .slice(0, 2)
      .forEach((event) => adapter.push(event))
    for (let sequence = 3; sequence <= 256; sequence++)
      adapter.push(frame(scope, sequence, 'item/agentMessage/delta', { text: 'bounded fixture' }))
    const before = adapter.snapshot()
    expect(() =>
      adapter.push(frame(scope, 257, 'item/agentMessage/delta', { text: 'overflow' })),
    ).toThrow('FIXTURE_EVENT_LIMIT')
    expect(adapter.snapshot()).toEqual(before)
  })
  it.each(['toString', 'constructor', '__proto__'])('rejects inherited method %s', (method) => {
    expect(() =>
      new OfflineAdapter(fixtureScope()).push(frame(fixtureScope(), 1, method, { text: 'x' })),
    ).toThrow('UNSUPPORTED_EVENT')
  })
  it.each(['codex', 'claude'] as const)('cancels %s only after a request', (provider) => {
    const scope = fixtureScope(provider),
      adapter = new OfflineAdapter(scope)
    successTranscript(scope)
      .slice(0, 2)
      .forEach((event) => adapter.push(event))
    adapter.push(
      frame(scope, 3, provider === 'codex' ? 'turn/interrupt' : 'fixture.interrupt', {
        text: 'Cancel',
      }),
    )
    adapter.push(
      frame(scope, 4, provider === 'codex' ? 'turn/cancelled' : 'fixture.cancelled', {
        text: 'Cancelled',
      }),
    )
    expect(adapter.snapshot().state).toBe('cancelled')
  })
  it.each(['codex', 'claude'] as const)(
    'records and replays deterministic %s events',
    (provider) => {
      const scope = fixtureScope(provider),
        run = () => {
          const adapter = new OfflineAdapter(scope)
          successTranscript(scope).forEach((event) => adapter.push(event))
          return adapter.snapshot()
        }
      expect(run()).toEqual(run())
      expect(run().state).toBe('completed')
      expect(run().executable).toBe(false)
      expect(Object.isFrozen(run().events)).toBe(true)
    },
  )
  it('Claude runtime remains blocked, even with a successful fixture', () => {
    expect(capabilities('claude').runtime).toBe('UNAVAILABLE_BLOCKED_UNSUPPORTED')
    expect(readFileSync('src-tauri/src/alice_v2_policy.rs', 'utf8')).toContain(
      'BLOCKED_UNSUPPORTED_CLAUDE_PERMISSION_CHANNEL',
    )
  })
  it.each([
    'copilot',
    'cursor',
    'antigravity',
    'opencode',
    'mimo',
    'freebuff',
    'kiro',
    'kimi',
    'grok',
    'codewhale',
    'unknown',
  ])('does not promote %s generic terminal support', (provider) => {
    expect(capabilities(provider)).toMatchObject({
      fixtureAvailable: false,
      executable: false,
      runtime: 'NOT_YET_STRUCTURED_UNAVAILABLE',
    })
  })
  it.each(['projectId', 'graphRevision', 'nodeId', 'runId', 'attemptId', 'provider', 'mode'])(
    'rejects foreign %s without mutating state',
    (key) => {
      const scope = fixtureScope(),
        adapter = new OfflineAdapter(scope),
        event = structuredClone(successTranscript(scope)[0])
      Object.assign(event.scope, {
        [key]: key === 'graphRevision' ? 2 : key === 'provider' ? 'claude' : 'foreign',
      })
      expect(() => adapter.push(event)).toThrow()
      expect(adapter.snapshot().cursor).toBe(0)
    },
  )
  it.each([0, 2, -1, 0.5])('rejects sequence %s', (sequence) => {
    expect(() =>
      new OfflineAdapter(fixtureScope()).push({
        ...successTranscript(fixtureScope())[0],
        sequence,
      }),
    ).toThrow()
  })
  it('refuses replay and unexpected completion/cancellation', () => {
    const scope = fixtureScope(),
      adapter = new OfflineAdapter(scope),
      events = successTranscript(scope)
    adapter.push(events[0])
    expect(() => adapter.push(events[0])).toThrow('DUPLICATE_OR_OUT_OF_ORDER_EVENT')
    expect(() => adapter.push(frame(scope, 2, 'turn/completed', { text: 'premature' }))).toThrow(
      'UNEXPECTED_EVENT_STATE',
    )
    expect(() => adapter.push(frame(scope, 2, 'turn/cancelled', { text: 'unexpected' }))).toThrow(
      'UNEXPECTED_CANCELLATION',
    )
  })
  it('requires known scoped fixture sessions for resume', () => {
    const scope = fixtureScope(),
      event = frame(scope, 1, 'thread/resume', { fixtureSessionId: 'fixture_known' })
    expect(() => new OfflineAdapter(scope).push(event)).toThrow('UNKNOWN_FIXTURE_SESSION')
    expect(
      new OfflineAdapter(scope, [{ fixtureSessionId: 'fixture_known', scope }]).push(event).kind,
    ).toBe('resumed')
    expect(() => new OfflineAdapter(scope, [{ fixtureSessionId: 'host_session', scope }])).toThrow(
      'FOREIGN_FIXTURE_SESSION',
    )
  })
  it('does not autoapprove a tool request', () => {
    const scope = fixtureScope(),
      adapter = new OfflineAdapter(scope)
    successTranscript(scope)
      .slice(0, 2)
      .forEach((e) => adapter.push(e))
    adapter.push(
      frame(scope, 3, 'item/commandExecution/requestApproval', {
        approvalId: 'approval1',
        tool: 'write',
      }),
    )
    expect(adapter.snapshot().state).toBe('awaiting-approval')
    expect(() => adapter.push(frame(scope, 4, 'turn/completed', { text: 'unsafe' }))).toThrow()
    expect(() =>
      adapter.push(
        frame(scope, 4, 'approval/answer', { approvalId: 'foreign', decision: 'allow' }),
      ),
    ).toThrow('FOREIGN_APPROVAL')
    adapter.push(frame(scope, 4, 'approval/answer', { approvalId: 'approval1', decision: 'deny' }))
    expect(adapter.snapshot().state).toBe('failed')
  })
  it('Codex steer differs from Claude interrupt and queued correction', () => {
    for (const provider of ['codex', 'claude'] as const) {
      const scope = fixtureScope(provider),
        adapter = new OfflineAdapter(scope)
      successTranscript(scope)
        .slice(0, 2)
        .forEach((e) => adapter.push(e))
      if (provider === 'codex') adapter.push(frame(scope, 3, 'turn/steer', { text: 'Correction' }))
      else {
        adapter.push(frame(scope, 3, 'fixture.interrupt', { text: 'Correction' }))
        adapter.push(frame(scope, 4, 'fixture.interrupted', { text: 'Interrupted' }))
        adapter.push(frame(scope, 5, 'fixture.correction', { text: 'Queued correction' }))
      }
      expect(adapter.snapshot().state).toBe('running')
    }
  })
  it.each(['apiKey', 'authRef', 'accessToken', 'credential', 'hostUrl'])(
    'rejects extra %s payload',
    (key) => {
      const scope = fixtureScope()
      expect(() =>
        new OfflineAdapter(scope).push(
          frame(scope, 1, 'thread/start', { fixtureSessionId: 'fixture_a', [key]: 'dummy' }),
        ),
      ).toThrow()
    },
  )
  it.each(['https://host/path', '{{ $env.SECRET }}', '../private', 'Bearer dummy'])(
    'rejects unsafe text %s',
    (text) => {
      const scope = fixtureScope(),
        adapter = new OfflineAdapter(scope)
      adapter.push(successTranscript(scope)[0])
      expect(() => adapter.push(frame(scope, 2, 'turn/start', { text }))).toThrow()
    },
  )
  it('unknown method and malformed tool approval fail closed', () => {
    const scope = fixtureScope(),
      adapter = new OfflineAdapter(scope)
    expect(() => adapter.push(frame(scope, 1, 'exec/shell', { text: 'x' }))).toThrow(
      'UNSUPPORTED_EVENT',
    )
    successTranscript(scope)
      .slice(0, 2)
      .forEach((e) => adapter.push(e))
    expect(() =>
      adapter.push(
        frame(scope, 3, 'item/commandExecution/requestApproval', {
          approvalId: 'a',
          tool: 'shell',
        }),
      ),
    ).toThrow('UNSUPPORTED_TOOL')
  })
})
