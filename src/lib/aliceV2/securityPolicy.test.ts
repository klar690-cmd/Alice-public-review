// @vitest-environment node
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  type AuthorityFacts,
  codexTurnFixture,
  evaluateOfflineGrant,
  normalizedWorkspacePath,
  type OfflineGrant,
  type OfflineRequest,
} from './securityPolicy'

function fixture(): { grant: OfflineGrant; request: OfflineRequest; facts: AuthorityFacts } {
  const scope = {
    projectId: 'projectA',
    graphRevision: 4,
    nodeId: 'codexNode',
    runId: 'run1',
    attemptId: 'attempt1',
    provider: 'codex' as const,
    mode: 'local-app-server' as const,
  }
  const policy = { approval: 'on-request' as const, sandbox: 'workspace-write' as const }
  return {
    grant: {
      ...scope,
      kind: 'ALICE_OFFLINE_GRANT_V1',
      grantId: 'grant1',
      workspaceRoot: 'C:/Alice/ProjectA',
      action: 'start',
      tools: ['read', 'write'],
      policy: { ...policy },
      authRef: 'authref:account1',
      sessionRef: null,
      startsAtMs: 1000,
      expiresAtMs: 3000,
      nonce: 'nonce1',
      approvalRef: 'approval1',
      reservationId: 'reserve1',
      budgetUnits: 10,
    },
    request: {
      ...scope,
      kind: 'ALICE_OFFLINE_REQUEST_V1',
      action: 'start',
      tools: ['read'],
      policy: { ...policy },
      authRef: 'authref:account1',
      sessionRef: null,
      cwd: 'C:/Alice/ProjectA/src',
      costUnits: 5,
    },
    facts: {
      kind: 'ALICE_OFFLINE_FACTS_V1',
      nowMs: 2000,
      workspaceRoot: 'C:/Alice/ProjectA',
      canonicalRoot: 'C:/Alice/ProjectA',
      canonicalCwd: 'C:/Alice/ProjectA/src',
      auth: {
        projectId: 'projectA',
        provider: 'codex',
        mode: 'local-app-server',
        authRef: 'authref:account1',
      },
      approvedGrant: { grantId: 'grant1', nonce: 'nonce1', approvalRef: 'approval1' },
      reservation: { projectId: 'projectA', reservationId: 'reserve1', remainingUnits: 10 },
      spentNonces: [],
    },
  }
}
// Invalid JSON shapes are intentional inputs to the boundary validator.
type Mutable = {
  grant: Record<string, any>
  request: Record<string, any>
  facts: Record<string, any>
}
const negatives: [string, (f: Mutable) => void, string][] = [
  [
    'missing grant',
    (f) => {
      f.grant = null as unknown as Mutable['grant']
    },
    'NO_GRANT',
  ],
  [
    'unknown provider',
    (f) => {
      f.request.provider = 'other'
    },
    'UNKNOWN_PROVIDER',
  ],
  [
    'managed mode',
    (f) => {
      f.request.mode = 'managed-api'
    },
    'UNKNOWN_MODE',
  ],
  [
    'foreign project',
    (f) => {
      f.request.projectId = 'projectB'
    },
    'SCOPE_MISMATCH',
  ],
  [
    'foreign node',
    (f) => {
      f.request.nodeId = 'nodeB'
    },
    'SCOPE_MISMATCH',
  ],
  [
    'foreign run',
    (f) => {
      f.request.runId = 'runB'
    },
    'SCOPE_MISMATCH',
  ],
  [
    'foreign attempt',
    (f) => {
      f.request.attemptId = 'attemptB'
    },
    'SCOPE_MISMATCH',
  ],
  [
    'stale graph',
    (f) => {
      f.request.graphRevision = 5
    },
    'STALE_GRAPH',
  ],
  [
    'foreign session',
    (f) => {
      f.request.sessionRef = 'sessionB'
    },
    'AUTH_MISMATCH',
  ],
  [
    'foreign account',
    (f) => {
      f.request.authRef = 'authref:other'
    },
    'AUTH_MISMATCH',
  ],
  [
    'foreign auth project',
    (f) => {
      f.facts.auth.projectId = 'projectB'
    },
    'AUTH_MISMATCH',
  ],
  [
    'foreign auth provider',
    (f) => {
      f.facts.auth.provider = 'claude'
    },
    'AUTH_MISMATCH',
  ],
  [
    'missing approval proof',
    (f) => {
      f.facts.approvedGrant.approvalRef = 'other'
    },
    'APPROVAL_REQUIRED',
  ],
  [
    'forged nonce proof',
    (f) => {
      f.facts.approvedGrant.nonce = 'other'
    },
    'APPROVAL_REQUIRED',
  ],
  [
    'expired',
    (f) => {
      f.facts.nowMs = 3000
    },
    'EXPIRED_GRANT',
  ],
  [
    'not started',
    (f) => {
      f.facts.nowMs = 999
    },
    'EXPIRED_GRANT',
  ],
  [
    'reversed time',
    (f) => {
      f.grant.expiresAtMs = 1000
    },
    'EXPIRED_GRANT',
  ],
  [
    'consumed nonce',
    (f) => {
      f.facts.spentNonces = ['nonce1']
    },
    'REPLAYED_GRANT',
  ],
  [
    'traversal',
    (f) => {
      f.request.cwd = 'C:/Alice/ProjectA/../ProjectB'
    },
    'WORKSPACE_ESCAPE',
  ],
  [
    'sibling prefix',
    (f) => {
      f.request.cwd = 'C:/Alice/ProjectAB'
      f.facts.canonicalCwd = f.request.cwd
    },
    'WORKSPACE_ESCAPE',
  ],
  [
    'symlink escapes root',
    (f) => {
      f.facts.canonicalCwd = 'C:/Other'
    },
    'WORKSPACE_ESCAPE',
  ],
  [
    'symlink aliases inside root',
    (f) => {
      f.facts.canonicalCwd = 'C:/Alice/ProjectA/other'
    },
    'PATH_ALIAS',
  ],
  [
    'root itself is aliased',
    (f) => {
      f.facts.canonicalRoot = 'C:/Other'
    },
    'WORKSPACE_ESCAPE',
  ],
  [
    'UNC path',
    (f) => {
      f.request.cwd = '\\\\host\\share'
    },
    'WORKSPACE_ESCAPE',
  ],
  [
    'device path',
    (f) => {
      f.request.cwd = 'C:/Alice/ProjectA/NUL'
    },
    'WORKSPACE_ESCAPE',
  ],
  [
    'unknown budget',
    (f) => {
      f.facts.reservation.remainingUnits = null
    },
    'UNKNOWN_BUDGET',
  ],
  [
    'over budget',
    (f) => {
      f.request.costUnits = 11
    },
    'BUDGET_EXCEEDED',
  ],
  [
    'foreign reservation',
    (f) => {
      f.facts.reservation.projectId = 'projectB'
    },
    'BUDGET_EXCEEDED',
  ],
  [
    'empty budget',
    (f) => {
      f.grant.budgetUnits = 0
    },
    'BUDGET_EXCEEDED',
  ],
  [
    'unsafe numeric budget',
    (f) => {
      f.request.costUnits = Number.MAX_SAFE_INTEGER + 1
    },
    'MALFORMED',
  ],
  [
    'extra tool',
    (f) => {
      f.request.tools = ['test']
    },
    'CAPABILITY_MISMATCH',
  ],
  [
    'unknown tool',
    (f) => {
      f.request.tools = ['shell']
    },
    'UNKNOWN_TOOL',
  ],
  [
    'unknown action',
    (f) => {
      f.request.action = 'executeAnything'
    },
    'UNKNOWN_ACTION',
  ],
  [
    'wrong action',
    (f) => {
      f.request.action = 'resume'
      f.request.sessionRef = 'session1'
    },
    'CAPABILITY_MISMATCH',
  ],
  [
    'bypass sandbox',
    (f) => {
      f.request.policy.sandbox = 'danger-full-access'
    },
    'UNKNOWN_POLICY',
  ],
  [
    'unknown approval',
    (f) => {
      f.request.policy.approval = 'bypass'
    },
    'UNKNOWN_POLICY',
  ],
  [
    'no approval write mode',
    (f) => {
      f.request.policy.approval = 'never'
    },
    'UNSAFE_POLICY',
  ],
  [
    'policy change',
    (f) => {
      f.request.policy.sandbox = 'read-only'
    },
    'POLICY_MISMATCH',
  ],
  [
    'bare UI grant boolean',
    (f) => {
      f.grant.realAccess = true
    },
    'MALFORMED',
  ],
  [
    'extra credentials',
    (f) => {
      f.request.apiKey = 'dummy'
    },
    'SECRET_MATERIAL',
  ],
  [
    'secret disguised in ref',
    (f) => {
      f.request.authRef = 'authref:sk-test'
    },
    'SECRET_MATERIAL',
  ],
  [
    'nested token',
    (f) => {
      f.facts.extra = { accessToken: 'dummy' }
    },
    'SECRET_MATERIAL',
  ],
]

describe('offline project/node/run authority', () => {
  it('returns only offline eligibility and an immutable replay ledger', () => {
    const f = fixture(),
      before = JSON.stringify(f)
    const result = evaluateOfflineGrant(f.grant, f.request, f.facts)
    expect(result).toEqual({
      code: 'ELIGIBLE_OFFLINE',
      executable: false,
      nextSpentNonces: ['nonce1'],
    })
    expect(Object.isFrozen(result.nextSpentNonces)).toBe(true)
    expect(JSON.stringify(f)).toBe(before)
    expect(
      evaluateOfflineGrant(f.grant, f.request, { ...f.facts, spentNonces: result.nextSpentNonces })
        .code,
    ).toBe('REPLAYED_GRANT')
  })
  it.each(negatives)('denies %s', (_name, mutate, expected) => {
    const f = structuredClone(fixture()) as unknown as Mutable
    mutate(f)
    expect(evaluateOfflineGrant(f.grant, f.request, f.facts)).toEqual({
      code: expected,
      executable: false,
    })
  })
  it.each(['resume', 'cancel', 'steer'] as const)('%s needs its own fresh grant', (action) => {
    const f = fixture()
    const grant = { ...f.grant, action, sessionRef: 'session1' },
      request = { ...f.request, action, sessionRef: 'session1' }
    expect(evaluateOfflineGrant(grant, request, f.facts).code).toBe('ELIGIBLE_OFFLINE')
    expect(evaluateOfflineGrant(grant, request, { ...f.facts, spentNonces: ['nonce1'] }).code).toBe(
      'REPLAYED_GRANT',
    )
    expect(evaluateOfflineGrant(f.grant, request, f.facts).code).toBe('CAPABILITY_MISMATCH')
  })
  it('read-only never allows a write tool', () => {
    const f = fixture(),
      policy = { approval: 'never' as const, sandbox: 'read-only' as const }
    expect(
      evaluateOfflineGrant(
        { ...f.grant, policy, tools: ['read'] },
        { ...f.request, policy },
        f.facts,
      ).code,
    ).toBe('ELIGIBLE_OFFLINE')
    expect(
      evaluateOfflineGrant(
        { ...f.grant, policy },
        { ...f.request, policy, tools: ['write'] },
        f.facts,
      ).code,
    ).toBe('READ_ONLY')
  })
  it('Claude structured execution and read-only remain unavailable', () => {
    const f = fixture(),
      provider = 'claude' as const,
      mode = 'local-cli-json' as const
    expect(
      evaluateOfflineGrant(
        { ...f.grant, provider, mode },
        { ...f.request, provider, mode },
        { ...f.facts, auth: { ...f.facts.auth, provider, mode } },
      ).code,
    ).toBe('BLOCKED_UNSUPPORTED_CLAUDE_PERMISSION_CHANNEL')
  })
  it.each([
    'C:/Alice/../Other',
    'C:/Alice/.',
    'C:/Alice/folder.',
    'C:/Alice/con',
    'C:/Alice/aux.txt',
    'C:/Alice//x',
    'C:relative',
    '/mnt/c/alice',
  ])('rejects ambiguous path %s', (path) => {
    expect(() => normalizedWorkspacePath(path)).toThrow('WORKSPACE_ESCAPE')
  })
  it('case and separator normalization respects Windows boundaries', () => {
    expect(normalizedWorkspacePath('C:\\Alice\\ProjectA')).toBe('c:/alice/projecta')
  })
})

describe('mocked protocol and native source wiring (not Rust execution)', () => {
  it.each(['first', 'resumed', 'inbox', 'follow-up'])(
    'keeps approval and sandbox for %s turns',
    (text) => {
      const params = codexTurnFixture(
        { approval: 'on-request', sandbox: 'workspace-write' },
        'C:/Alice',
        'thread1',
        text,
      )
      expect(params.approvalPolicy).toBe('on-request')
      expect(params.sandboxPolicy).toEqual({
        type: 'workspaceWrite',
        writableRoots: ['c:/alice'],
        networkAccess: false,
        excludeTmpdirEnvVar: true,
        excludeSlashTmp: true,
      })
    },
  )
  it('unknown policy cannot silently become never', () => {
    expect(() =>
      codexTurnFixture(
        { approval: 'bad', sandbox: 'read-only' } as unknown as Parameters<
          typeof codexTurnFixture
        >[0],
        'C:/Alice',
        'thread1',
        '',
      ),
    ).toThrow('UNKNOWN_POLICY')
  })
  it('all three native turn starts use validated job policy', () => {
    const source = readFileSync('src-tauri/src/orchestrator_core.rs', 'utf8')
    expect(source).not.toMatch(/"approvalPolicy"\s*:\s*"never"/)
    expect(source.match(/codex_turn_params\(job, &thread_id, /g)).toHaveLength(2)
    expect(source).toContain('let turn_params = codex_turn_params(inner.jobs.get(&job_id)')
    expect(source).toContain(
      'policy::structured_worker_policy(&job.agent, &job.approval_policy, &job.sandbox)?;',
    )
    expect(source).toContain(
      'let effective = policy::EffectiveCodexPolicy::parse(approval_policy, sandbox)?;',
    )
    expect(source).not.toContain('.unwrap_or(Value::String("never".into()))')
  })
  it('structured Claude is blocked before process creation, manual PTY untouched', () => {
    const source = readFileSync('src-tauri/src/orchestrator_core.rs', 'utf8')
    const constructor = source.slice(
      source.indexOf('pub fn claude_headless'),
      source.indexOf('/// A worker runs'),
    )
    expect(constructor).not.toContain('bypassPermissions')
    const spawn = source.slice(
      source.indexOf('fn spawn_worker'),
      source.indexOf('fn on_worker_request'),
    )
    expect(spawn.indexOf('policy::structured_worker_policy')).toBeLessThan(
      spawn.indexOf('Command::new'),
    )
    expect(source).toContain('BLOCKED_UNSUPPORTED_CLAUDE_READ_ONLY')
    expect(readFileSync('src/lib/types.ts', 'utf8')).toContain('dangerously-skip-permissions')
  })
  it('unknown and missing approval requests never autoaccept', () => {
    const source = readFileSync('src-tauri/src/orchestrator_core.rs', 'utf8')
    expect(source).toContain('unsupported request {method}')
    expect(source).toContain('BLOCKED_MISSING_APPROVAL_REQUEST_ID')
    expect(source).not.toContain('"result": { "decision": "accept" }')
  })
  it('a policy refusal terminates rather than holding an approval slot', () => {
    const source = readFileSync('src-tauri/src/orchestrator_core.rs', 'utf8')
    const spawn = source.slice(
      source.indexOf('fn spawn_worker'),
      source.indexOf('fn on_worker_request'),
    )
    expect(spawn).not.toContain('STATUS_BLOCKED')
    expect(spawn).toContain('STATUS_FAILED, "policy-blocked"')
    expect(source).toContain('job.outcome = Some("policy-blocked".into());')
  })
  it('new modules cannot call runtime/credential/network entrypoints', () => {
    for (const path of [
      'src/lib/aliceV2/securityPolicy.ts',
      'src/lib/aliceV2/livePlan.ts',
      'src-tauri/src/alice_v2_policy.rs',
    ]) {
      const source = readFileSync(path, 'utf8')
      expect(source).not.toMatch(
        /fetch\s*\(|invoke\s*\(|Command::|ChildStdin|reqwest|std::fs|localStorage|keyring|process\.env/,
      )
    }
  })
})
