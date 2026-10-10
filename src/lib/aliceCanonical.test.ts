import { describe, expect, it } from 'vitest'

import fixture from '../preview/canonical-r216.json'
import { createDemoConnections } from '../preview/data'
import {
  assertCanonicalDispatch,
  createLiveEvent,
  parseRumoCanonical,
  readRumoCanonical,
} from './aliceCanonical'
const files = fixture as Record<string, string>
const main = files['main:'],
  fixed = files['assistente/source-art-active:']
const control = files[main + ':docs/coordination/CONTROL.md'],
  agent = files[fixed + ':docs/coordination/ASSISTENTE.md'],
  task = files[fixed + ':docs/coordination/PHASE_ASSISTENTE_R216_ALICE_LIVE_ORCHESTRATION_V1.md']
const parse = () =>
  parseRumoCanonical(control, agent, task, {
    mainSha: main,
    fixedSha: fixed,
    readAt: Date.now(),
    fixture: false,
  })
describe('Rumo canonical read/dispatch adapter', () => {
  it('reads parked state/LATEST while keeping dispatch disabled', async () => {
    const parked = agent.replace(
      /^CURRENT_TASK:.*$/m,
      'CURRENT_TASK: ' +
        String.fromCharCode(96) +
        'NONE__COMPLETED_AND_PARKED' +
        String.fromCharCode(96),
    )
    const snapshot = await readRumoCanonical(
      async (ref, path) =>
        path === 'docs/coordination/ASSISTENTE.md' ? parked : files[ref + ':' + path],
      false,
    )
    expect(snapshot.taskState).toBe('PARKED')
    expect(snapshot.taskPath).toBe('')
    expect(() => assertCanonicalDispatch(snapshot, snapshot)).toThrow()
  })
  it('pins reads and exposes current task plus result pointer', async () => {
    const calls: string[] = []
    const result = await readRumoCanonical(async (ref, path) => {
      calls.push(ref + ':' + path)
      return files[ref + ':' + path]
    }, true)
    expect(result).toMatchObject({
      identity: 'ASSISTENTE/WORK',
      taskRevision: 1,
      generation: 60,
      branch: 'alice/r216-live-orchestration-v1',
      candidate: '5f9f8ff71576d90bbe7da6d0e25e33880480768f',
      fixture: true,
    })
    expect(calls).toContain(main + ':docs/coordination/CONTROL.md')
    expect(calls).toContain(fixed + ':' + result.resultPath)
  })
  it.each([
    'IDENTITY',
    'TASK_ID',
    'TASK_REVISION',
    'SESSION_ID',
    'AUTHORIZATION_GENERATION',
    'COORDINATION_REVISION',
    'EXECUTION_BRANCH',
    'BASE_CANDIDATE_SHA',
    'TASK_STATE',
  ])('rejects %s drift between contracts', (key) => {
    const altered = task.replace(
      new RegExp('^' + key + ':.*$', 'm'),
      key + ': ' + String.fromCharCode(96) + 'mismatch' + String.fromCharCode(96),
    )
    expect(() =>
      parseRumoCanonical(control, agent, altered, {
        mainSha: main,
        fixedSha: fixed,
        readAt: Date.now(),
        fixture: false,
      }),
    ).toThrow()
  })
  it.each([
    'identity',
    'taskId',
    'taskRevision',
    'sessionId',
    'generation',
    'branch',
    'candidate',
  ] as const)('fails closed on dispatch %s mismatch', (key) => {
    const snapshot = parse()
    expect(() =>
      assertCanonicalDispatch(snapshot, {
        ...snapshot,
        [key]: typeof snapshot[key] === 'number' ? 999 : 'wrong',
      }),
    ).toThrow()
  })
  it('blocks stale, fixture, missing agent and incompatible project dispatch', () => {
    const snapshot = parse()
    expect(() => assertCanonicalDispatch({ ...snapshot, fixture: true }, snapshot)).toThrow()
    expect(() => assertCanonicalDispatch({ ...snapshot, readAt: 0 }, snapshot)).toThrow()
    const state = createDemoConnections()
    expect(() =>
      createLiveEvent(state, 'demo-agent-0', 'alice-demo', 'canonical.dispatch.requested', {
        snapshot,
        expected: snapshot,
      }),
    ).toThrow()
    expect(() => createLiveEvent(state, 'missing', 'alice-demo', 'connection.test')).toThrow()
    expect(() => createLiveEvent(state, 'demo-assistente', 'other', 'connection.test')).toThrow()
    expect(
      createLiveEvent(state, 'demo-assistente', 'alice-demo', 'canonical.dispatch.requested', {
        snapshot,
        expected: snapshot,
      }),
    ).toMatchObject({
      canonical_task: {
        generation: 60,
        sessionId: snapshot.sessionId,
        mainSha: main,
        fixedSha: fixed,
      },
    })
  })
  it('never sends credential references or arbitrary model properties', () => {
    const state = createDemoConnections()
    state.accounts[0].secretReference = { store: 'os-keychain', key: 'alice:connection' }
    const event = createLiveEvent(state, 'demo-assistente', 'alice-demo', 'connection.test')
    expect(JSON.stringify(event)).not.toContain('secretReference')
    expect(JSON.stringify(event)).not.toContain('alice:connection')
  })
})

const modernTaskId = 'PHASE_ASSISTENTE_R239_ALICE_SAFE_CONTINUATION_PREFLIGHT_V1'
const tick = String.fromCharCode(96)
const documentFields = (fields: Record<string, string>) =>
  Object.entries(fields)
    .map(([key, value]) => key + ': ' + tick + value + tick)
    .join('\n')
function modernDocuments() {
  const revision = 'COORD-SANITIZED-R239'
  const session = 'SANITIZED-ALICE-STATUS-SESSION'
  const branch = 'assistente/sanitized-readonly-evidence'
  const controlFields = {
    COORDINATION_REVISION: revision,
    ASSISTENTE_GEN68_TASK: modernTaskId,
    ASSISTENTE_GEN68_TASK_REVISION: '1',
    ASSISTENTE_GEN68_AUTHORIZATION_GENERATION: '68',
    ASSISTENTE_GEN68_SESSION: session,
    ASSISTENTE_GEN68_FIXED_BRANCH: 'assistente/source-art-active',
    ASSISTENTE_GEN68_EVIDENCE_BRANCH: branch,
    ASSISTENTE_GEN68_STATE: 'PARKED_READY_FOR_MANUAL_RELAY__NOT_STARTED',
  }
  const agentFields = {
    IDENTITY: 'ASSISTENTE/WORK',
    FIXED_COORDINATION_BRANCH: 'assistente/source-art-active',
    COORDINATION_REVISION: revision,
    TASK_ID: modernTaskId,
    TASK_REVISION: '1',
    AUTHORIZATION_GENERATION: '68',
    SESSION_ID: session,
    TASK_STATE: 'READY',
    AGENT_STATE: 'PARKED',
    CURRENT_TASK: 'docs/coordination/' + modernTaskId + '.md',
    EVIDENCE_EXECUTION_BRANCH: branch,
  }
  const taskFields = {
    IDENTITY: 'ASSISTENTE/WORK',
    FIXED_COORDINATION_BRANCH: 'assistente/source-art-active',
    COORDINATION_REVISION: revision,
    TASK_ID: modernTaskId,
    TASK_REVISION: '1',
    AUTHORIZATION_GENERATION: '68',
    SESSION_ID: session,
    TASK_STATE: 'READY',
    EVIDENCE_EXECUTION_BRANCH: branch,
    ALICE_PRODUCT_WRITE_ALLOWLIST: 'NONE',
  }
  const latestFields = { RESULT_ARCHIVE_REF: 'docs/coordination/results/archive/sanitized.md' }
  return {
    controlFields,
    agentFields,
    taskFields,
    latestFields,
    render() {
      return {
        control:
          '# CONTROL\n\n## CURRENT AUTHORITATIVE STATE\n\n' +
          documentFields(this.controlFields) +
          '\n\n## HISTORICAL SNAPSHOTS\n\n' +
          documentFields({ COORDINATION_REVISION: 'OLD', ASSISTENTE_GEN68_SESSION: 'OLD' }),
        agent: documentFields(this.agentFields),
        task: documentFields(this.taskFields),
        latest: documentFields(this.latestFields),
      }
    },
  }
}
const modernProvenance = () => ({
  mainSha: 'a'.repeat(40),
  fixedSha: 'b'.repeat(40),
  readAt: Date.now(),
  fixture: false,
})
function parseModern(docs = modernDocuments()) {
  const text = docs.render()
  return parseRumoCanonical(text.control, text.agent, text.task, modernProvenance(), text.latest)
}
describe('R240 modern read-only canonical status', () => {
  it('reads a current R239 audit without inventing executable product authority', () => {
    const result = parseModern()
    expect(result).toMatchObject({
      identity: 'ASSISTENTE/WORK',
      taskId: modernTaskId,
      taskRevision: 1,
      generation: 68,
      branch: 'assistente/sanitized-readonly-evidence',
      candidate: '',
      taskState: 'READ_ONLY',
      observedTaskState: 'READY',
      resultPointer: 'docs/coordination/results/archive/sanitized.md',
    })
    expect(() => assertCanonicalDispatch(result, result)).toThrow()
  })
})

describe('R240 compatibility and fail-closed negatives', () => {
  it('pins modern reads and never performs reads from archival task authority', async () => {
    const docs = modernDocuments().render()
    const calls: string[] = []
    const metadata = modernProvenance()
    const result = await readRumoCanonical(async (ref, path) => {
      calls.push(ref + ':' + path)
      if (!path) return ref === 'main' ? metadata.mainSha : metadata.fixedSha
      if (path.endsWith('CONTROL.md')) return docs.control
      if (path.endsWith('ASSISTENTE_LATEST.md')) return docs.latest
      if (path.endsWith('ASSISTENTE.md')) return docs.agent
      if (path.endsWith(modernTaskId + '.md')) return docs.task
      throw new Error('unexpected read')
    }, false)
    expect(result.taskState).toBe('READ_ONLY')
    expect(calls).toContain(metadata.mainSha + ':docs/coordination/CONTROL.md')
    expect(calls).toContain(metadata.fixedSha + ':docs/coordination/' + modernTaskId + '.md')
    expect(calls).toHaveLength(6)
  })
  it('reads modern parked/done metadata without fetching an old task', async () => {
    const docs = modernDocuments()
    docs.agentFields.CURRENT_TASK = 'NONE'
    docs.agentFields.TASK_STATE = 'DONE'
    const text = docs.render()
    const result = await readRumoCanonical(async (ref, path) => {
      if (!path) return ref === 'main' ? 'a'.repeat(40) : 'b'.repeat(40)
      if (path.endsWith('CONTROL.md')) return text.control
      if (path.endsWith('ASSISTENTE_LATEST.md')) return text.latest
      if (path.endsWith('ASSISTENTE.md')) return text.agent
      throw new Error('parked status must not fetch a task')
    }, false)
    expect(result).toMatchObject({ taskState: 'PARKED', observedTaskState: 'DONE', taskPath: '' })
    expect(() => assertCanonicalDispatch(result, result)).toThrow()
  })
  it('maps matching modern/legacy aliases and archived result pointers', () => {
    const docs = modernDocuments()
    Object.assign(docs.agentFields, {
      IDENTIDADE_ESPERADA: 'ASSISTENTE/WORK',
      BRANCH_FIXA: 'assistente/source-art-active',
    })
    Object.assign(docs.latestFields, {
      ARCHIVE_RESULT_REF: docs.latestFields.RESULT_ARCHIVE_REF,
    })
    expect(parseModern(docs).resultPointer).toBe(docs.latestFields.RESULT_ARCHIVE_REF)
  })
  it.each([
    'IDENTITY',
    'FIXED_COORDINATION_BRANCH',
    'TASK_ID',
    'TASK_REVISION',
    'AUTHORIZATION_GENERATION',
    'SESSION_ID',
    'COORDINATION_REVISION',
    'TASK_STATE',
    'CURRENT_TASK',
    'EVIDENCE_EXECUTION_BRANCH',
  ])('rejects missing modern agent %s', (key) => {
    const docs = modernDocuments()
    delete (docs.agentFields as Record<string, string>)[key]
    expect(() => parseModern(docs)).toThrow()
  })
  it.each([
    'IDENTITY',
    'TASK_ID',
    'TASK_REVISION',
    'AUTHORIZATION_GENERATION',
    'SESSION_ID',
    'COORDINATION_REVISION',
    'TASK_STATE',
    'EVIDENCE_EXECUTION_BRANCH',
  ])('rejects missing modern task %s', (key) => {
    const docs = modernDocuments()
    delete (docs.taskFields as Record<string, string>)[key]
    expect(() => parseModern(docs)).toThrow()
  })
  it.each([
    'TASK_ID',
    'TASK_REVISION',
    'AUTHORIZATION_GENERATION',
    'SESSION_ID',
    'COORDINATION_REVISION',
    'TASK_STATE',
    'EVIDENCE_EXECUTION_BRANCH',
  ])('rejects modern task %s drift', (key) => {
    const docs = modernDocuments()
    ;(docs.taskFields as Record<string, string>)[key] = 'mismatch'
    expect(() => parseModern(docs)).toThrow()
  })
  it.each([
    'ASSISTENTE_GEN68_TASK',
    'ASSISTENTE_GEN68_TASK_REVISION',
    'ASSISTENTE_GEN68_AUTHORIZATION_GENERATION',
    'ASSISTENTE_GEN68_SESSION',
    'ASSISTENTE_GEN68_FIXED_BRANCH',
    'ASSISTENTE_GEN68_EVIDENCE_BRANCH',
    'ASSISTENTE_GEN68_STATE',
    'COORDINATION_REVISION',
  ])('rejects missing authority %s', (key) => {
    const docs = modernDocuments()
    delete (docs.controlFields as Record<string, string>)[key]
    expect(() => parseModern(docs)).toThrow()
  })
  it.each([
    'ASSISTENTE_GEN68_TASK',
    'ASSISTENTE_GEN68_TASK_REVISION',
    'ASSISTENTE_GEN68_AUTHORIZATION_GENERATION',
    'ASSISTENTE_GEN68_SESSION',
    'ASSISTENTE_GEN68_FIXED_BRANCH',
    'ASSISTENTE_GEN68_EVIDENCE_BRANCH',
    'COORDINATION_REVISION',
  ])('rejects contradictory authority %s', (key) => {
    const docs = modernDocuments()
    ;(docs.controlFields as Record<string, string>)[key] = 'wrong'
    expect(() => parseModern(docs)).toThrow()
  })
  it.each([
    'DONE_PARKED',
    'SUPERSEDED_READY',
    'DEFERRED_UNSTARTED',
    'SUSPENDED',
    'BLOCKED',
    'ACTIVE',
  ])('rejects stale READY assignment with control state %s', (state) => {
    const docs = modernDocuments()
    docs.controlFields.ASSISTENTE_GEN68_STATE = state
    expect(() => parseModern(docs)).toThrow()
  })
  it('does not resurrect a field missing from current authority using history', () => {
    const docs = modernDocuments().render()
    docs.control = docs.control.replace(
      documentFields({ ASSISTENTE_GEN68_SESSION: 'SANITIZED-ALICE-STATUS-SESSION' }),
      '',
    )
    expect(() =>
      parseRumoCanonical(docs.control, docs.agent, docs.task, modernProvenance()),
    ).toThrow()
  })
  it.each(['IDENTIDADE_ESPERADA', 'BRANCH_FIXA'])('rejects conflicting legacy alias %s', (key) => {
    const docs = modernDocuments()
    ;(docs.agentFields as Record<string, string>)[key] = 'wrong'
    expect(() => parseModern(docs)).toThrow()
  })
  it('rejects conflicting latest archive aliases', () => {
    const docs = modernDocuments()
    ;(docs.latestFields as Record<string, string>).ARCHIVE_RESULT_REF = 'other.md'
    expect(() => parseModern(docs)).toThrow()
  })
  it('supports a legacy archived result pointer without a modern alias', () => {
    const docs = modernDocuments()
    delete (docs.latestFields as Record<string, string>).RESULT_ARCHIVE_REF
    ;(docs.latestFields as Record<string, string>).ARCHIVE_RESULT_REF =
      'docs/coordination/results/archive/legacy.md'
    expect(parseModern(docs).resultPointer).toContain('archive/legacy.md')
  })
  it('rejects duplicate conflicting current task/session fields', () => {
    const docs = modernDocuments().render()
    const duplicate = '\n' + documentFields({ SESSION_ID: 'CONFLICT' })
    expect(() =>
      parseRumoCanonical(docs.control, docs.agent + duplicate, docs.task, modernProvenance()),
    ).toThrow()
    expect(() =>
      parseRumoCanonical(docs.control, docs.agent, docs.task + duplicate, modernProvenance()),
    ).toThrow()
    expect(() =>
      parseRumoCanonical(
        docs.control.replace(
          '## HISTORICAL',
          duplicate.replace('SESSION_ID', 'ASSISTENTE_GEN68_SESSION') + '\n## HISTORICAL',
        ),
        docs.agent,
        docs.task,
        modernProvenance(),
      ),
    ).toThrow()
  })
  it('rejects missing or duplicate current-authority delimiters', () => {
    const docs = modernDocuments().render()
    expect(() =>
      parseRumoCanonical(
        docs.control.replace('## CURRENT AUTHORITATIVE STATE', '# Unknown'),
        docs.agent,
        docs.task,
        modernProvenance(),
      ),
    ).toThrow()
    expect(() =>
      parseRumoCanonical(
        docs.control + '\n## CURRENT AUTHORITATIVE STATE\n',
        docs.agent,
        docs.task,
        modernProvenance(),
      ),
    ).toThrow()
  })
  it('honors the legacy end marker before archive text', () => {
    const docs = modernDocuments().render()
    docs.control = docs.control.replace(
      '## HISTORICAL SNAPSHOTS',
      'CURRENT_STATE_END: ' + tick + 'YES' + tick,
    )
    expect(
      parseRumoCanonical(docs.control, docs.agent, docs.task, modernProvenance()).generation,
    ).toBe(68)
  })
  it.each(['0', '-1', '1.5', 'Infinity', '1e2', '9007199254740992'])(
    'rejects invalid revision/generation %s',
    (value) => {
      const docs = modernDocuments()
      docs.agentFields.TASK_REVISION =
        docs.taskFields.TASK_REVISION =
        docs.controlFields.ASSISTENTE_GEN68_TASK_REVISION =
          value
      expect(() => parseModern(docs)).toThrow()
      const fresh = modernDocuments()
      fresh.agentFields.AUTHORIZATION_GENERATION = fresh.taskFields.AUTHORIZATION_GENERATION = value
      expect(() => parseModern(fresh)).toThrow()
    },
  )
  it.each(['', 'prefix' + 'a'.repeat(40), 'a'.repeat(40) + 'suffix', 'A'.repeat(40)])(
    'rejects invalid pinned SHA %s',
    (sha) => {
      const docs = modernDocuments().render()
      expect(() =>
        parseRumoCanonical(docs.control, docs.agent, docs.task, {
          ...modernProvenance(),
          mainSha: sha,
        }),
      ).toThrow()
      expect(() =>
        parseRumoCanonical(docs.control, docs.agent, docs.task, {
          ...modernProvenance(),
          fixedSha: sha,
        }),
      ).toThrow()
    },
  )
  it.each([NaN, Infinity, -1])('rejects malformed read time %s', (readAt) => {
    const docs = modernDocuments().render()
    expect(() =>
      parseRumoCanonical(docs.control, docs.agent, docs.task, { ...modernProvenance(), readAt }),
    ).toThrow()
  })
  it('keeps modern fully based product metadata read-only, without widening dispatch', () => {
    const docs = modernDocuments()
    delete (docs.agentFields as Record<string, string>).EVIDENCE_EXECUTION_BRANCH
    delete (docs.taskFields as Record<string, string>).EVIDENCE_EXECUTION_BRANCH
    delete (docs.controlFields as Record<string, string>).ASSISTENTE_GEN68_EVIDENCE_BRANCH
    Object.assign(docs.agentFields, {
      ALICE_EXECUTION_BRANCH: 'alice/sanitized-next__CREATE_ONLY_AFTER_PRECHECK',
      EXACT_ALICE_FUNCTIONAL_BASE: 'c'.repeat(40),
    })
    Object.assign(docs.taskFields, {
      ALICE_NEW_EXECUTION_BRANCH: 'alice/sanitized-next',
      ALICE_REPORTED_VERIFIED_R224_FUNCTIONAL_BASE_SHA: 'c'.repeat(40),
    })
    Object.assign(docs.controlFields, {
      ASSISTENTE_GEN68_ALICE_EXECUTION_BRANCH: 'alice/sanitized-next__CREATE_IF_SAFE_ONLY',
      ASSISTENTE_GEN68_EXACT_ALICE_BASE: 'c'.repeat(40) + '__R224_FUNCTIONAL__NOT_DOCS_HEAD',
    })
    const snapshot = parseModern(docs)
    expect(snapshot).toMatchObject({
      branch: 'alice/sanitized-next',
      candidate: 'c'.repeat(40),
      taskState: 'READ_ONLY',
    })
    expect(() => assertCanonicalDispatch(snapshot, snapshot)).toThrow()
    ;(docs.taskFields as Record<string, string>).ALICE_REPORTED_VERIFIED_R224_FUNCTIONAL_BASE_SHA =
      'd'.repeat(40)
    expect(() => parseModern(docs)).toThrow()
  })
  it('rejects partial base/candidate metadata instead of inventing it', () => {
    const docs = modernDocuments()
    Object.assign(docs.agentFields, { BASE_CANDIDATE_SHA: 'c'.repeat(40) })
    expect(() => parseModern(docs)).toThrow()
  })
  it('never creates a dispatch event for modern audit status, even with matching expectations', () => {
    const state = createDemoConnections()
    const snapshot = parseModern()
    expect(() =>
      createLiveEvent(state, 'demo-assistente', 'alice-demo', 'canonical.dispatch.requested', {
        snapshot,
        expected: snapshot,
      }),
    ).toThrow()
    expect(() => assertCanonicalDispatch({ ...snapshot, fixture: true }, snapshot)).toThrow()
    expect(() => assertCanonicalDispatch({ ...snapshot, readAt: 0 }, snapshot)).toThrow()
  })
  it('does not widen the historical future-timestamp dispatch gate', () => {
    const snapshot = parse()
    expect(() =>
      assertCanonicalDispatch({ ...snapshot, readAt: Date.now() + 10000 }, snapshot),
    ).toThrow()
  })
  it('keeps an explicitly read-only legacy task non-executable', () => {
    const legacyAudit = task + '\n' + documentFields({ TASK_SCOPE: 'READ_ONLY_AUDIT' })
    const snapshot = parseRumoCanonical(control, agent, legacyAudit, modernProvenance())
    expect(snapshot.taskState).toBe('READ_ONLY')
    expect(() => assertCanonicalDispatch(snapshot, snapshot)).toThrow()
  })
  it('rejects conflicting modern aliases on a legacy executable record', () => {
    expect(() =>
      parseRumoCanonical(
        control,
        agent + '\n' + documentFields({ IDENTITY: 'OTHER' }),
        task,
        modernProvenance(),
      ),
    ).toThrow()
  })
})

describe('R240 final safety boundaries', () => {
  it('rejects missing fixed-branch authority in a modern task', () => {
    const docs = modernDocuments()
    delete (docs.taskFields as Record<string, string>).FIXED_COORDINATION_BRANCH
    expect(() => parseModern(docs)).toThrow()
  })
  it('rejects an older generation even when its historical assignment remains in current text', () => {
    const docs = modernDocuments()
    Object.assign(docs.controlFields, { ASSISTENTE_GEN69_TASK: 'PHASE_ASSISTENTE_NEXT' })
    expect(() => parseModern(docs)).toThrow()
  })
  it.each(['ACTIVE', 'RUNNING', 'DONE', 'BLOCKED'])(
    'reads modern %s status without execution',
    (state) => {
      const docs = modernDocuments()
      docs.agentFields.TASK_STATE = docs.taskFields.TASK_STATE = state
      docs.controlFields.ASSISTENTE_GEN68_STATE = state
      const snapshot = parseModern(docs)
      expect(snapshot.taskState).toBe(state)
      expect(() => assertCanonicalDispatch(snapshot, snapshot)).toThrow()
    },
  )
  it('accepts duplicate equal metadata, while still rejecting conflicting values', () => {
    const docs = modernDocuments().render()
    expect(
      parseRumoCanonical(
        docs.control,
        docs.agent + '\n' + documentFields({ SESSION_ID: 'SANITIZED-ALICE-STATUS-SESSION' }),
        docs.task,
        modernProvenance(),
      ).taskState,
    ).toBe('READ_ONLY')
  })
  it('honors a legacy read-only declaration even when another scope field exists', () => {
    const audit =
      task +
      '\n' +
      documentFields({
        TASK_SCOPE: 'ALICE_STATUS',
        TASK_CLASS: 'READ_ONLY_AUDIT',
      })
    const snapshot = parseRumoCanonical(control, agent, audit, modernProvenance())
    expect(snapshot.taskState).toBe('READ_ONLY')
    expect(() => assertCanonicalDispatch(snapshot, snapshot)).toThrow()
  })
  it.each(['SESSION_ID', 'TASK_REVISION', 'AUTHORIZATION_GENERATION', 'FIXED_COORDINATION_BRANCH'])(
    'rejects missing parked %s',
    async (key) => {
      const docs = modernDocuments()
      docs.agentFields.CURRENT_TASK = 'NONE'
      docs.agentFields.TASK_STATE = 'DONE'
      delete (docs.agentFields as Record<string, string>)[key]
      const text = docs.render()
      await expect(
        readRumoCanonical(async (ref, path) => {
          if (!path) return ref === 'main' ? 'a'.repeat(40) : 'b'.repeat(40)
          if (path.endsWith('CONTROL.md')) return text.control
          if (path.endsWith('ASSISTENTE_LATEST.md')) return text.latest
          return text.agent
        }, false),
      ).rejects.toThrow()
    },
  )
})

describe('R240 legacy read-only authority boundaries', () => {
  it('does not authorize a legacy ready task when CONTROL assigns a read-only scope', () => {
    const readOnlyControl = control.replace(
      /^ASSISTENTE_GEN60_SCOPE:.*$/m,
      documentFields({ ASSISTENTE_GEN60_SCOPE: 'READ_ONLY_STATUS' }),
    )
    const snapshot = parseRumoCanonical(readOnlyControl, agent, task, modernProvenance())
    expect(snapshot.taskState).toBe('READ_ONLY')
    expect(() => assertCanonicalDispatch(snapshot, snapshot)).toThrow()
  })
  it('honors a read-only scope explicitly published in legacy agent metadata', () => {
    const snapshot = parseRumoCanonical(
      control,
      agent + '\n' + documentFields({ TASK_SCOPE: 'READ_ONLY_STATUS' }),
      task,
      modernProvenance(),
    )
    expect(snapshot.taskState).toBe('READ_ONLY')
    expect(() => assertCanonicalDispatch(snapshot, snapshot)).toThrow()
  })
})
