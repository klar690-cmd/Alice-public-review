import type { Scope } from '../securityPolicy'
import {
  type AdapterState,
  capabilities,
  checkedScope,
  count,
  deny,
  type EventKind,
  fixtureId,
  immutable,
  type NormalizedEvent,
  OFFLINE,
  plainText,
  record,
  sameScope,
} from './contracts'

const codexKinds: Record<string, EventKind> = {
  'thread/start': 'opened',
  'thread/resume': 'resumed',
  'turn/start': 'started',
  'item/agentMessage/delta': 'text',
  'tool/request': 'tool',
  'item/commandExecution/requestApproval': 'approval',
  'approval/answer': 'answer',
  'thread/tokenUsage/updated': 'usage',
  'artifact/record': 'artifact',
  'turn/completed': 'completed',
  'turn/failed': 'failed',
  'turn/interrupt': 'cancel-requested',
  'turn/cancelled': 'cancelled',
  'turn/steer': 'steered',
  'status/updated': 'status',
}
const claudeKinds: Record<string, EventKind> = {
  'fixture.init': 'opened',
  'fixture.resume': 'resumed',
  'fixture.user': 'started',
  'fixture.assistant': 'text',
  'fixture.tool': 'tool',
  'fixture.usage': 'usage',
  'fixture.artifact': 'artifact',
  'fixture.result': 'completed',
  'fixture.error': 'failed',
  'fixture.interrupt': 'cancel-requested',
  'fixture.cancelled': 'cancelled',
  'fixture.interrupted': 'interrupted',
  'fixture.correction': 'correction',
  'fixture.status': 'status',
}

/** A strict in-memory transcript interpreter, not a provider transport. */
export class OfflineAdapter {
  private state: AdapterState = 'created'
  private cursor = 0
  private pending: string | null = null
  private readonly sessions = new Set<string>()
  private readonly events: NormalizedEvent[] = []
  readonly scope: Scope
  readonly descriptor: ReturnType<typeof capabilities>

  constructor(scope: Scope, sessions: readonly { fixtureSessionId: string; scope: Scope }[] = []) {
    if (sessions.length > 64) deny('FIXTURE_SESSION_LIMIT')
    this.scope = checkedScope(scope)
    this.descriptor = capabilities(this.scope.provider)
    for (const session of sessions) {
      record(session, ['fixtureSessionId', 'scope'])
      fixtureId(session.fixtureSessionId)
      if (
        !session.fixtureSessionId.startsWith('fixture_') ||
        !sameScope(this.scope, checkedScope(session.scope))
      )
        deny('FOREIGN_FIXTURE_SESSION')
      this.sessions.add(session.fixtureSessionId)
    }
  }
  snapshot() {
    return immutable({
      marker: OFFLINE,
      executable: false as const,
      scope: this.scope,
      state: this.state,
      cursor: this.cursor,
      pendingApproval: this.pending,
      events: [...this.events],
    })
  }

  fork(): OfflineAdapter {
    const copy = new OfflineAdapter(this.scope)
    copy.state = this.state
    copy.cursor = this.cursor
    copy.pending = this.pending
    this.sessions.forEach((session) => copy.sessions.add(session))
    copy.events.push(...this.events)
    return copy
  }

  push(value: unknown): NormalizedEvent {
    if (this.cursor >= 256) deny('FIXTURE_EVENT_LIMIT')
    const frame = record(value, ['marker', 'schemaVersion', 'scope', 'sequence', 'wire'])
    if (frame.marker !== OFFLINE || frame.schemaVersion !== 1) deny('NOT_AN_OFFLINE_FIXTURE')
    if (!sameScope(this.scope, checkedScope(frame.scope))) deny('FOREIGN_EVENT_SCOPE')
    count(frame.sequence)
    if (frame.sequence !== this.cursor + 1) deny('DUPLICATE_OR_OUT_OF_ORDER_EVENT')
    const codex = this.scope.provider === 'codex'
    const wire = record(frame.wire, codex ? ['method', 'params'] : ['type', 'body'])
    const name = codex ? wire.method : wire.type
    const mapping = codex ? codexKinds : claudeKinds
    if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(mapping, name))
      deny('UNSUPPORTED_EVENT')
    const kind = mapping[name]
    if (!kind) deny('UNSUPPORTED_EVENT')
    const payload = codex ? wire.params : wire.body
    const keys = ['opened', 'resumed'].includes(kind)
      ? ['fixtureSessionId']
      : ['tool', 'approval'].includes(kind)
        ? ['approvalId', 'tool']
        : kind === 'answer'
          ? ['approvalId', 'decision']
          : kind === 'usage'
            ? ['units']
            : kind === 'artifact'
              ? ['artifactId', 'summary']
              : kind === 'status'
                ? ['state']
                : ['text']
    const data = record(payload, keys)
    let next = this.state,
      pending = this.pending,
      newSession: string | null = null
    const active = () => {
      if (this.state !== 'running') deny('UNEXPECTED_EVENT_STATE')
    }
    switch (kind) {
      case 'opened':
      case 'resumed':
        if (this.state !== 'created') deny('UNEXPECTED_EVENT_STATE')
        fixtureId(data.fixtureSessionId)
        if (!data.fixtureSessionId.startsWith('fixture_')) deny('HOST_SESSION_NOT_ALLOWED')
        if (kind === 'resumed' && !this.sessions.has(data.fixtureSessionId))
          deny('UNKNOWN_FIXTURE_SESSION')
        if (kind === 'opened' && this.sessions.has(data.fixtureSessionId))
          deny('DUPLICATE_FIXTURE_SESSION')
        newSession = data.fixtureSessionId
        next = 'opened'
        break
      case 'started':
      case 'correction':
        if (this.state !== 'opened') deny('UNEXPECTED_EVENT_STATE')
        plainText(data.text)
        next = 'running'
        break
      case 'tool':
      case 'approval':
        active()
        fixtureId(data.approvalId)
        if (!['read', 'write', 'test'].includes(String(data.tool))) deny('UNSUPPORTED_TOOL')
        if (kind === 'approval') {
          pending = data.approvalId
          next = 'awaiting-approval'
        }
        break
      case 'answer':
        if (this.state !== 'awaiting-approval' || data.approvalId !== pending)
          deny('FOREIGN_APPROVAL')
        if (!['allow', 'deny'].includes(String(data.decision))) deny('INVALID_APPROVAL_DECISION')
        next = data.decision === 'allow' ? 'running' : 'failed'
        pending = null
        break
      case 'cancel-requested':
        if (!['opened', 'running', 'awaiting-approval'].includes(this.state))
          deny('UNEXPECTED_CANCELLATION')
        plainText(data.text)
        next = 'cancelling'
        pending = null
        break
      case 'cancelled':
      case 'interrupted':
        if (this.state !== 'cancelling') deny('UNEXPECTED_CANCELLATION')
        plainText(data.text)
        next = kind === 'interrupted' ? 'opened' : 'cancelled'
        break
      case 'usage':
        active()
        count(data.units)
        break
      case 'artifact':
        active()
        fixtureId(data.artifactId)
        plainText(data.summary)
        break
      case 'status':
        if (data.state !== this.state || ['completed', 'failed', 'cancelled'].includes(this.state))
          deny('UNEXPECTED_EVENT_STATE')
        break
      case 'text':
      case 'steered':
      case 'completed':
      case 'failed':
        active()
        plainText(data.text)
        if (kind === 'completed') next = 'completed'
        if (kind === 'failed') next = 'failed'
        break
    }
    const event = immutable({
      marker: OFFLINE,
      executable: false as const,
      scope: this.scope,
      sequence: frame.sequence,
      eventId: `${this.scope.projectId}_${this.scope.runId}_${this.scope.nodeId}_${this.scope.attemptId}_${frame.sequence}`,
      kind,
      data: structuredClone(data),
    })
    this.state = next
    this.pending = pending
    this.cursor = frame.sequence
    if (newSession) this.sessions.add(newSession)
    this.events.push(event)
    return event
  }
}
