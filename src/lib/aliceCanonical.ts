import { isAlicePreview } from './aliceEnvironment'
import { aliceGithubRead } from './tauri/alice'
import type {
  AliceCanonicalBinding,
  AliceCanonicalSnapshot,
  AliceConnectionState,
  AliceLiveEvent,
} from './types'

export type CanonicalReader = (ref: string, path: string) => Promise<string>
export const RUMO_REPOSITORY = 'klar690-cmd/RumoAoMilhao'
const FIXED_BRANCH = 'assistente/source-art-active'

const fieldConflicts = new WeakMap<Record<string, string>, Set<string>>()
function rejectConflicts(fields: Record<string, string>, keys = Object.keys(fields)): void {
  if (keys.some((key) => fieldConflicts.get(fields)?.has(key)))
    throw new Error('alice.canonicalMismatch')
}
function alias(fields: Record<string, string>, keys: string[], optional = false): string {
  rejectConflicts(fields, keys)
  const values = keys.flatMap((key) => (fields[key] === undefined ? [] : [fields[key]]))
  if (new Set(values).size > 1 || (!optional && !values.length))
    throw new Error('alice.canonicalMismatch')
  return values[0] ?? ''
}
function positiveInteger(value: string): number {
  const number = Number(value)
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(number))
    throw new Error('alice.canonicalMismatch')
  return number
}
function canonicalControlFields(document: string, modern: boolean): Record<string, string> {
  const headings = [...document.matchAll(/^## CURRENT AUTHORITATIVE STATE[ \t]*\r?$/gm)]
  if (headings.length > 1 || (modern && headings.length !== 1))
    throw new Error('alice.canonicalMismatch')
  const start = headings[0] ? headings[0].index! + headings[0][0].length : 0
  const current = document.slice(start)
  const end = current.search(/^##[ \t]+|^CURRENT_STATE_END:/m)
  return canonicalFields(end < 0 ? current : current.slice(0, end))
}
function resultPointer(document: string): string | undefined {
  return (
    alias(canonicalFields(document), ['RESULT_ARCHIVE_REF', 'ARCHIVE_RESULT_REF'], true) ||
    undefined
  )
}
function validateProvenance(
  provenance: Pick<AliceCanonicalSnapshot, 'mainSha' | 'fixedSha' | 'readAt' | 'fixture'>,
): void {
  if (
    !/^[a-f0-9]{40}$/.test(provenance.mainSha) ||
    !/^[a-f0-9]{40}$/.test(provenance.fixedSha) ||
    !Number.isFinite(provenance.readAt) ||
    provenance.readAt < 0 ||
    typeof provenance.fixture !== 'boolean'
  )
    throw new Error('alice.canonicalMismatch')
}
function statusValue(value: string): string {
  // These published planning suffixes are annotations, never part of the actual branch/base.
  return value.replace(
    /__(?:CREATE_ONLY_IF_EXACT_SAFE_BASE|CREATE_ONLY_AFTER_PRECHECK|CREATE_IF_SAFE_ONLY|R224_FUNCTIONAL__NOT_DOCS_HEAD)$/,
    '',
  )
}
function statusAlias(fields: Record<string, string>, keys: string[], optional = false): string {
  rejectConflicts(fields, keys)
  const values = keys.flatMap((key) =>
    fields[key] === undefined ? [] : [statusValue(fields[key])],
  )
  if (new Set(values).size > 1 || (!optional && !values.length))
    throw new Error('alice.canonicalMismatch')
  return values[0] ?? ''
}
function canonicalIdentity(agent: Record<string, string>): string {
  const identity = alias(agent, ['IDENTITY', 'IDENTIDADE_ESPERADA'])
  if (
    identity !== 'ASSISTENTE/WORK' ||
    alias(agent, ['FIXED_COORDINATION_BRANCH', 'BRANCH_FIXA']) !== FIXED_BRANCH
  )
    throw new Error('alice.canonicalMismatch')
  return identity
}
function statusAssignment(
  control: Record<string, string>,
  agent: Record<string, string>,
  modern: boolean,
): { generation: number; revision: number; prefix: string } {
  canonicalIdentity(agent)
  const generation = positiveInteger(required(agent, 'AUTHORIZATION_GENERATION'))
  const revision = positiveInteger(required(agent, 'TASK_REVISION'))
  const prefix = 'ASSISTENTE_GEN' + generation
  if (modern) {
    const assignedGenerations = Object.keys(control).flatMap((key) => {
      const match = /^ASSISTENTE_GEN([1-9]\d*)_TASK$/.exec(key)
      return match ? [positiveInteger(match[1])] : []
    })
    if (generation !== Math.max(...assignedGenerations)) throw new Error('alice.canonicalMismatch')
  }
  rejectConflicts(
    control,
    Object.keys(control).filter(
      (key) => key.startsWith(prefix + '_') || key === 'COORDINATION_REVISION',
    ),
  )
  if (
    required(control, 'COORDINATION_REVISION') !== required(agent, 'COORDINATION_REVISION') ||
    required(control, prefix + '_TASK') !== required(agent, 'TASK_ID') ||
    positiveInteger(required(control, prefix + '_TASK_REVISION')) !== revision
  )
    throw new Error('alice.canonicalMismatch')
  const assignedGeneration = alias(control, [prefix + '_AUTHORIZATION_GENERATION'], !modern)
  const assignedSession = alias(control, [prefix + '_SESSION'], !modern)
  const assignedFixed = alias(control, [prefix + '_FIXED_BRANCH'], !modern)
  const session = required(agent, 'SESSION_ID')
  if (
    (assignedGeneration && positiveInteger(assignedGeneration) !== generation) ||
    (assignedSession && assignedSession !== session) ||
    (assignedFixed && assignedFixed !== FIXED_BRANCH)
  )
    throw new Error('alice.canonicalMismatch')
  return { generation, revision, prefix }
}
function statusBinding(
  control: Record<string, string>,
  agent: Record<string, string>,
  task: Record<string, string>,
  prefix: string,
  parked = false,
): { branch: string; candidate: string } {
  const sourceKeys = ['ALICE_EXECUTION_BRANCH', 'EXECUTION_BRANCH', 'ALICE_NEW_EXECUTION_BRANCH']
  const sourceMode = sourceKeys.some((key) => agent[key] !== undefined || task[key] !== undefined)
  const agentKeys = sourceMode ? sourceKeys : ['EVIDENCE_EXECUTION_BRANCH', 'EVIDENCE_BRANCH']
  const controlKeys = sourceMode
    ? [prefix + '_ALICE_EXECUTION_BRANCH', prefix + '_EXECUTION_BRANCH', prefix + '_BRANCH']
    : [prefix + '_EVIDENCE_BRANCH']
  const branch = statusAlias(agent, agentKeys, parked)
  const assignedBranch = statusAlias(control, controlKeys, parked)
  const taskBranch = parked ? branch : statusAlias(task, agentKeys)
  if (
    branch !== assignedBranch ||
    branch !== taskBranch ||
    (branch && !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(branch)) ||
    branch.includes('..') ||
    branch.endsWith('/')
  )
    throw new Error('alice.canonicalMismatch')
  const agentBase = statusAlias(
    agent,
    [
      'BASE_CANDIDATE_SHA',
      'EXACT_ALICE_FUNCTIONAL_BASE',
      'ALICE_FUNCTIONAL_BASE',
      'ALICE_CANDIDATE_SHA',
    ],
    true,
  )
  const controlBase = statusAlias(control, [prefix + '_BASE', prefix + '_EXACT_ALICE_BASE'], true)
  const taskBase = parked
    ? agentBase
    : statusAlias(
        task,
        [
          'BASE_CANDIDATE_SHA',
          'ALICE_FUNCTIONAL_BASE_SHA',
          'EXACT_ALICE_FUNCTIONAL_BASE_SHA',
          'ALICE_REPORTED_VERIFIED_R224_FUNCTIONAL_BASE_SHA',
        ],
        true,
      )
  if (
    agentBase !== controlBase ||
    agentBase !== taskBase ||
    (agentBase && !/^[a-f0-9]{40}$/.test(agentBase))
  )
    throw new Error('alice.canonicalMismatch')
  return { branch, candidate: agentBase }
}
function parseReadOnlyCanonical(
  controlDoc: string,
  agentDoc: string,
  taskDoc: string,
  provenance: Pick<AliceCanonicalSnapshot, 'mainSha' | 'fixedSha' | 'readAt' | 'fixture'>,
  latestDoc: string,
): AliceCanonicalSnapshot {
  const agent = canonicalFields(agentDoc),
    task = canonicalFields(taskDoc)
  rejectConflicts(agent)
  rejectConflicts(task)
  const modern = agent.IDENTITY !== undefined || agent.FIXED_COORDINATION_BRANCH !== undefined
  const control = canonicalControlFields(controlDoc, modern)
  const { generation, revision, prefix } = statusAssignment(control, agent, modern)
  validateProvenance(provenance)
  for (const key of [
    'TASK_ID',
    'TASK_REVISION',
    'SESSION_ID',
    'AUTHORIZATION_GENERATION',
    'COORDINATION_REVISION',
    'TASK_STATE',
  ]) {
    if (required(agent, key) !== required(task, key)) throw new Error('alice.canonicalMismatch')
  }
  if (
    alias(task, ['IDENTITY', 'IDENTIDADE_ESPERADA']) !== canonicalIdentity(agent) ||
    (alias(task, ['FIXED_COORDINATION_BRANCH', 'BRANCH_FIXA'], !modern) &&
      alias(task, ['FIXED_COORDINATION_BRANCH', 'BRANCH_FIXA'], !modern) !== FIXED_BRANCH)
  )
    throw new Error('alice.canonicalMismatch')
  const taskId = required(task, 'TASK_ID'),
    observedTaskState = required(task, 'TASK_STATE')
  const assignedState = required(control, prefix + '_STATE')
  if (
    !/^PHASE_ASSISTENTE_[A-Z0-9_]+$/.test(taskId) ||
    agent.CURRENT_TASK !== 'docs/coordination/' + taskId + '.md' ||
    !/^[A-Z][A-Z0-9_]*$/.test(observedTaskState) ||
    (observedTaskState === 'READY' &&
      (!assignedState.includes('READY') ||
        /DONE|COMPLETE|DEFERRED|SUSPENDED|SUPERSEDED|BLOCKED/.test(assignedState))) ||
    (['ACTIVE', 'RUNNING'].includes(observedTaskState) && !/ACTIVE|RUNNING/.test(assignedState))
  )
    throw new Error('alice.canonicalMismatch')
  const binding = statusBinding(control, agent, task, prefix)
  return Object.assign(
    {
      identity: canonicalIdentity(agent),
      taskId,
      taskRevision: revision,
      sessionId: required(agent, 'SESSION_ID'),
      generation,
      ...binding,
      repository: RUMO_REPOSITORY,
      fixedBranch: FIXED_BRANCH,
      taskPath: agent.CURRENT_TASK,
      // Modern compatibility is status-only; the existing dispatch gate requires READY.
      taskState: observedTaskState === 'READY' ? 'READ_ONLY' : observedTaskState,
      coordinationRevision: agent.COORDINATION_REVISION,
      resultPath: 'docs/coordination/results/ASSISTENTE_LATEST.md',
      resultPointer: resultPointer(latestDoc),
      ...provenance,
    },
    { observedTaskState },
  )
}
function parseParkedCanonical(
  controlDoc: string,
  agentDoc: string,
  latestDoc: string,
  provenance: Pick<AliceCanonicalSnapshot, 'mainSha' | 'fixedSha' | 'readAt' | 'fixture'>,
): AliceCanonicalSnapshot {
  const agent = canonicalFields(agentDoc)
  rejectConflicts(agent)
  const modern = agent.IDENTITY !== undefined || agent.FIXED_COORDINATION_BRANCH !== undefined
  const control = canonicalControlFields(controlDoc, modern)
  const { generation, revision, prefix } = statusAssignment(control, agent, modern)
  validateProvenance(provenance)
  if (agent.AGENT_STATE !== 'PARKED') throw new Error('alice.canonicalMismatch')
  return Object.assign(
    {
      identity: canonicalIdentity(agent),
      taskId: agent.CURRENT_TASK,
      taskRevision: revision,
      sessionId: required(agent, 'SESSION_ID'),
      generation,
      ...statusBinding(control, agent, {}, prefix, true),
      repository: RUMO_REPOSITORY,
      fixedBranch: FIXED_BRANCH,
      taskPath: '',
      taskState: 'PARKED',
      coordinationRevision: agent.COORDINATION_REVISION,
      resultPath: 'docs/coordination/results/ASSISTENTE_LATEST.md',
      resultPointer: resultPointer(latestDoc),
      ...provenance,
    },
    { observedTaskState: agent.TASK_STATE ?? 'PARKED' },
  )
}
export function parseRumoCanonical(
  controlDoc: string,
  agentDoc: string,
  taskDoc: string,
  provenance: Pick<AliceCanonicalSnapshot, 'mainSha' | 'fixedSha' | 'readAt' | 'fixture'>,
  latestDoc = '',
): AliceCanonicalSnapshot {
  const agent = canonicalFields(agentDoc),
    task = canonicalFields(taskDoc)
  rejectConflicts(agent)
  rejectConflicts(task)
  canonicalIdentity(agent)
  validateProvenance(provenance)
  const control = canonicalControlFields(controlDoc, false)
  const prefix = 'ASSISTENTE_GEN' + positiveInteger(required(agent, 'AUTHORIZATION_GENERATION'))
  rejectConflicts(control, [prefix + '_SCOPE'])
  if (
    agent.IDENTITY !== undefined ||
    agent.FIXED_COORDINATION_BRANCH !== undefined ||
    /READ_ONLY|READONLY|AUDIT|PREFLIGHT/.test(
      [
        task.TASK_SCOPE,
        task.TASK_CLASS,
        task.SCOPE,
        task.EXECUTION_ENVIRONMENT,
        task.TASK_ID,
        agent.TASK_SCOPE,
        agent.TASK_CLASS,
        control[prefix + '_SCOPE'],
      ].join(' '),
    ) ||
    task.PRODUCT_CODE_WRITES === 'FORBIDDEN' ||
    task.ALICE_PRODUCT_WRITE_ALLOWLIST === 'NONE'
  )
    return parseReadOnlyCanonical(controlDoc, agentDoc, taskDoc, provenance, latestDoc)
  rejectConflicts(
    control,
    Object.keys(control).filter(
      (key) =>
        key === 'COORDINATION_REVISION' ||
        key.startsWith(prefix + '_') ||
        key.startsWith('GG_ALICE_R219_') ||
        key.startsWith('GG_ALICE_R222_'),
    ),
  )
  return parseLegacyExecutableCanonical(controlDoc, agentDoc, taskDoc, provenance, latestDoc)
}

export function canonicalFields(document: string): Record<string, string> {
  const fields: Record<string, string> = {}
  const conflicts = new Set<string>()
  fieldConflicts.set(fields, conflicts)
  for (const line of document.split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*):\s*\x60([^\x60]+)\x60\s*$/.exec(line)
    if (match) {
      if (fields[match[1]] !== undefined && fields[match[1]] !== match[2]) conflicts.add(match[1])
      else fields[match[1]] = match[2]
    }
  }
  return fields
}
function required(fields: Record<string, string>, key: string): string {
  const value = fields[key]
  if (!value || value.includes('NONE__')) throw new Error('alice.canonicalMismatch')
  return value
}
function parseLegacyExecutableCanonical(
  controlDoc: string,
  agentDoc: string,
  taskDoc: string,
  provenance: Pick<AliceCanonicalSnapshot, 'mainSha' | 'fixedSha' | 'readAt' | 'fixture'>,
  latestDoc = '',
): AliceCanonicalSnapshot {
  const control = canonicalControlFields(controlDoc, false)
  const agent = canonicalFields(agentDoc),
    task = canonicalFields(taskDoc)
  for (const [agentKey, taskKey] of [
    ['IDENTIDADE_ESPERADA', 'IDENTITY'],
    ['TASK_ID', 'TASK_ID'],
    ['TASK_REVISION', 'TASK_REVISION'],
    ['SESSION_ID', 'SESSION_ID'],
    ['AUTHORIZATION_GENERATION', 'AUTHORIZATION_GENERATION'],
    ['COORDINATION_REVISION', 'COORDINATION_REVISION'],
  ] as const) {
    if (required(agent, agentKey) !== required(task, taskKey))
      throw new Error('alice.canonicalMismatch')
  }
  if (
    agent.IDENTIDADE_ESPERADA !== 'ASSISTENTE/WORK' ||
    agent.BRANCH_FIXA !== FIXED_BRANCH ||
    agent.TASK_STATE !== 'READY' ||
    task.TASK_STATE !== 'READY' ||
    control.COORDINATION_REVISION !== agent.COORDINATION_REVISION
  )
    throw new Error('alice.canonicalMismatch')
  const generation = Number(required(agent, 'AUTHORIZATION_GENERATION'))
  const revision = Number(required(agent, 'TASK_REVISION'))
  const prefix = 'ASSISTENTE_GEN' + generation
  const r219 =
    generation === 61 &&
    task.TASK_ID === 'PHASE_ASSISTENTE_R219_ALICE_WEB_AGENT_CANONICAL_HANDOFF_V1'
  const r222 =
    generation === 62 && task.TASK_ID === 'PHASE_ASSISTENTE_R222_ALICE_PANEL_LIFECYCLE_UX_V1'
  const modernPrefix = r222 ? 'GG_ALICE_R222' : r219 ? 'GG_ALICE_R219' : null
  const assignedTask = modernPrefix ? control[modernPrefix + '_TASK'] : control[prefix + '_TASK']
  const assignedRevision = modernPrefix
    ? control[modernPrefix + '_TASK_REVISION']?.split('__')[0]
    : control[prefix + '_TASK_REVISION']
  const assignedBranch = modernPrefix
    ? control[modernPrefix + '_EXECUTION_BRANCH']
    : control[prefix + '_BRANCH']
  const assignedBase = modernPrefix
    ? control[modernPrefix + '_EXACT_SOURCE_BASE']
    : control[prefix + '_BASE']
  const taskBranch = r222 ? task.ALICE_EXECUTION_BRANCH : task.EXECUTION_BRANCH
  const taskBase = r222 ? task.ALICE_FUNCTIONAL_BASE_SHA : task.BASE_CANDIDATE_SHA
  if (
    !Number.isSafeInteger(generation) ||
    generation < 1 ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    assignedTask !== task.TASK_ID ||
    assignedRevision !== String(revision) ||
    assignedBranch !== taskBranch ||
    assignedBase !== taskBase ||
    (r219 &&
      (control.GG_ALICE_R219_GENERATION !== String(generation) ||
        control.GG_ALICE_R219_TASK_SESSION !== task.SESSION_ID ||
        control.GG_ALICE_R219_FIXED_BRANCH !== FIXED_BRANCH ||
        !control.GG_ALICE_R219_STATE?.includes('READY_FOR_USER_MANUAL_RELAY'))) ||
    (r222 &&
      (control.GG_ALICE_R222_GENERATION !== String(generation) ||
        control.GG_ALICE_R222_SESSION !== task.SESSION_ID ||
        control.GG_ALICE_R222_FIXED_BRANCH !== FIXED_BRANCH ||
        !control.GG_ALICE_R222_STATE?.includes('READY_FOR_MANUAL_RELAY'))) ||
    agent.ALICE_EXECUTION_BRANCH !== taskBranch ||
    agent.BASE_CANDIDATE_SHA !== taskBase ||
    agent.CURRENT_TASK !== 'docs/coordination/' + task.TASK_ID + '.md' ||
    !/^[a-f0-9]{40}$/.test(provenance.mainSha) ||
    !/^[a-f0-9]{40}$/.test(provenance.fixedSha)
  )
    throw new Error('alice.canonicalMismatch')
  return {
    identity: agent.IDENTIDADE_ESPERADA,
    taskId: task.TASK_ID,
    taskRevision: revision,
    sessionId: task.SESSION_ID,
    generation,
    branch: taskBranch,
    candidate: taskBase,
    repository: RUMO_REPOSITORY,
    fixedBranch: FIXED_BRANCH,
    taskPath: agent.CURRENT_TASK,
    taskState: task.TASK_STATE,
    coordinationRevision: agent.COORDINATION_REVISION,
    resultPath: 'docs/coordination/results/ASSISTENTE_LATEST.md',
    resultPointer: resultPointer(latestDoc),
    ...provenance,
  }
}
const runtimeReader: CanonicalReader = (ref, path) => aliceGithubRead(RUMO_REPOSITORY, ref, path)
export async function readRumoCanonical(
  read: CanonicalReader = runtimeReader,
  fixture = isAlicePreview,
): Promise<AliceCanonicalSnapshot> {
  const [mainSha, fixedSha] = await Promise.all([read('main', ''), read(FIXED_BRANCH, '')])
  const [control, agent] = await Promise.all([
    read(mainSha, 'docs/coordination/CONTROL.md'),
    read(fixedSha, 'docs/coordination/ASSISTENTE.md'),
  ])
  const agentFields = canonicalFields(agent)
  const taskPath = agentFields.CURRENT_TASK
  let latest = ''
  try {
    latest = await read(fixedSha, 'docs/coordination/results/ASSISTENTE_LATEST.md')
  } catch {
    /* Optional result may not yet exist. */
  }
  if (taskPath === 'NONE' || taskPath?.startsWith('NONE__')) {
    return parseParkedCanonical(control, agent, latest, {
      mainSha,
      fixedSha,
      readAt: Date.now(),
      fixture,
    })
  }
  if (!/^docs\/coordination\/PHASE_ASSISTENTE_[A-Z0-9_]+\.md$/.test(taskPath ?? ''))
    throw new Error('alice.canonicalMismatch')
  const task = await read(fixedSha, taskPath)
  return parseRumoCanonical(
    control,
    agent,
    task,
    { mainSha, fixedSha, readAt: Date.now(), fixture },
    latest,
  )
}
export function assertCanonicalDispatch(
  snapshot: AliceCanonicalSnapshot,
  expected: AliceCanonicalBinding,
  now = Date.now(),
): void {
  if (
    snapshot.fixture ||
    snapshot.taskState !== 'READY' ||
    now - snapshot.readAt > 300000 ||
    snapshot.readAt > now + 1000
  )
    throw new Error('alice.canonicalMismatch')
  for (const key of [
    'identity',
    'taskId',
    'taskRevision',
    'sessionId',
    'generation',
    'branch',
    'candidate',
  ] as const)
    if (snapshot[key] !== expected[key]) throw new Error('alice.canonicalMismatch')
}
export function createLiveEvent(
  state: AliceConnectionState,
  agentId: string,
  projectId: string,
  action: AliceLiveEvent['action'],
  canonical?: { snapshot: AliceCanonicalSnapshot; expected: AliceCanonicalBinding },
): AliceLiveEvent {
  const agent = state.agents.find((a) => a.agentId === agentId)
  if (
    !agent ||
    !state.accounts.some((a) => a.accountId === agent.accountId) ||
    !projectId ||
    (agent.projectId && agent.projectId !== projectId)
  )
    throw new Error('alice.invalidBinding')
  if (action === 'canonical.dispatch.requested') {
    if (!canonical || agent.canonicalIdentity !== canonical.expected.identity)
      throw new Error('alice.canonicalMismatch')
    assertCanonicalDispatch(canonical.snapshot, canonical.expected)
  }
  const binding = canonical?.snapshot
  return {
    schema_version: 2,
    project_id: projectId,
    account_id: agent.accountId,
    agent_id: agent.agentId,
    session_id: agent.currentSessionId,
    action,
    timestamp: new Date().toISOString(),
    correlation_id: crypto.randomUUID(),
    ...(agent.canonicalTaskUrl ? { canonical_task_ref: agent.canonicalTaskUrl } : {}),
    ...(action === 'canonical.dispatch.requested' && binding
      ? {
          canonical_task: {
            identity: binding.identity,
            taskId: binding.taskId,
            taskRevision: binding.taskRevision,
            sessionId: binding.sessionId,
            generation: binding.generation,
            branch: binding.branch,
            candidate: binding.candidate,
            repository: binding.repository,
            taskPath: binding.taskPath,
            mainSha: binding.mainSha,
            fixedSha: binding.fixedSha,
          },
        }
      : {}),
  }
}
