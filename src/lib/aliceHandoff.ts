import { assertCanonicalDispatch } from './aliceCanonical'
import type { AliceCanonicalBinding, AliceCanonicalSnapshot, AliceConnectionState } from './types'
export function prepareAliceManualHandoff(
  state: AliceConnectionState,
  agentId: string,
  projectId: string,
  snapshot: AliceCanonicalSnapshot,
  expected: AliceCanonicalBinding,
) {
  assertCanonicalDispatch(snapshot, expected)
  const agent = state.agents.find((a) => a.agentId === agentId)
  if (
    !agent?.canonicalIdentity ||
    !state.accounts.some((a) => a.accountId === agent.accountId) ||
    !projectId ||
    agent.projectId !== projectId
  )
    throw new Error('alice.canonicalMismatch')
  return {
    schema_version: 1,
    action: 'canonical.handoff.review_requested',
    manual_relay_required: true,
    execution_authorized: false,
    source: {
      project_id: projectId,
      account_id: agent.accountId,
      agent_id: agent.agentId,
      canonical_identity: agent.canonicalIdentity,
    },
    authorized_task: {
      identity: snapshot.identity,
      task_id: snapshot.taskId,
      task_revision: snapshot.taskRevision,
      session_id: snapshot.sessionId,
      generation: snapshot.generation,
      branch: snapshot.branch,
      candidate: snapshot.candidate,
      repository: snapshot.repository,
      task_path: snapshot.taskPath,
      coordination_revision: snapshot.coordinationRevision,
      main_sha: snapshot.mainSha,
      fixed_sha: snapshot.fixedSha,
    },
    correlation_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  }
}
