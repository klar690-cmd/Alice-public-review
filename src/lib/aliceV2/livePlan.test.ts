// @vitest-environment node
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { describeOfflineLivePlan } from './livePlan'

function fixture() {
  return {
    request: {
      kind: 'ALICE_OFFLINE_REQUEST_V1',
      projectId: 'projectA',
      graphRevision: 4,
      nodeId: 'codexNode',
      runId: 'run1',
      attemptId: 'attempt1',
      provider: 'codex',
      mode: 'local-app-server',
      action: 'start',
      tools: ['read'],
      policy: { approval: 'on-request', sandbox: 'workspace-write' },
      authRef: 'authref:account1',
      sessionRef: null,
      cwd: 'C:/Alice/ProjectA',
      costUnits: 5,
    },
  }
}

describe('separate non-executable live descriptor', () => {
  it('omits broker authorization/session references from export', () => {
    const f = fixture(),
      plan = describeOfflineLivePlan(f.request),
      serialized = JSON.stringify(plan)
    expect(plan).toMatchObject({
      format: 'alice.live-plan.offline.v1',
      executable: false,
      brokerRequired: true,
      workflowPublished: false,
    })
    expect(serialized).not.toMatch(/authRef|authref:|sessionRef|approvalRef|reservationId|nonce/)
    expect(Object.isFrozen(plan)).toBe(true)
    expect(Object.isFrozen(plan.policy)).toBe(true)
    expect(Object.isFrozen(plan.tools)).toBe(true)
  })
  it.each(['fake', 'web-chatgpt', 'unknown'])('cannot promote %s into live mode', (provider) => {
    expect(() => describeOfflineLivePlan({ ...fixture().request, provider })).toThrow(
      'UNKNOWN_PROVIDER',
    )
  })
  it.each(['accessToken', 'refreshToken', 'apiKey', 'password', 'cookie', 'credentials'])(
    'refuses secret field %s',
    (field) => {
      expect(() => describeOfflineLivePlan({ ...fixture().request, [field]: 'dummy' })).toThrow(
        'SECRET_MATERIAL',
      )
    },
  )
  it('rejects executable/realAccess flags instead of ignoring them', () => {
    expect(() =>
      describeOfflineLivePlan({ ...fixture().request, executable: true, realAccess: true }),
    ).toThrow('MALFORMED')
  })
  it('does not export a Claude descriptor with false readiness', () => {
    expect(() =>
      describeOfflineLivePlan({ ...fixture().request, provider: 'claude', mode: 'local-cli-json' }),
    ).toThrow('BLOCKED_UNSUPPORTED_CLAUDE_PERMISSION_CHANNEL')
  })
  it('retains the original fake contract and compiler guard', () => {
    expect(readFileSync('src/lib/aliceV2/compile.ts', 'utf8')).toContain('executable: false')
    expect(readFileSync('src/lib/aliceV2/contracts.ts', 'utf8')).toContain('realAccess: false')
  })
})
