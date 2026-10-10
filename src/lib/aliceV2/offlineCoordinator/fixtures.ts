import { OFFLINE } from '../offlineAdapters/contracts'
import { frame } from '../offlineAdapters/fixtures'
import type { AuthorityFacts, OfflineGrant, OfflineRequest } from '../securityPolicy'
import { type FixtureAuthorization, OfflineCoordinator, type OfflineGraph } from './coordinator'

export function demoGraph(): OfflineGraph {
  return {
    marker: OFFLINE,
    schemaVersion: 1,
    projectId: 'projectA',
    graphRevision: 1,
    runId: 'run1',
    budgetUnits: 15,
    nodes: [
      {
        id: 'gg',
        role: 'gg',
        provider: 'codex',
        dependsOn: [],
        maxUnits: 5,
        tools: ['read'],
        needsApproval: false,
        approvalTimeoutTicks: 3,
        deadlineTicks: 10,
        maxAttempts: 2,
      },
      {
        id: 'codex',
        role: 'worker',
        provider: 'codex',
        dependsOn: ['gg'],
        maxUnits: 5,
        tools: ['read', 'write'],
        needsApproval: true,
        approvalTimeoutTicks: 3,
        deadlineTicks: 10,
        maxAttempts: 2,
      },
      {
        id: 'claude',
        role: 'worker',
        provider: 'claude',
        dependsOn: ['codex'],
        maxUnits: 5,
        tools: ['read'],
        needsApproval: false,
        approvalTimeoutTicks: 3,
        deadlineTicks: 10,
        maxAttempts: 2,
      },
    ],
  }
}
export function authorization(
  coordinator: OfflineCoordinator,
  nodeId: string,
  nonce: string,
  action: 'start' | 'resume' | 'cancel' = 'start',
  attempt?: number,
): FixtureAuthorization {
  const scope = coordinator.scope(nodeId, attempt),
    n = coordinator.graph.nodes.find((n) => n.id === nodeId)!,
    policy = { approval: 'on-request' as const, sandbox: 'workspace-write' as const },
    sessionRef = action === 'start' ? null : `fixture_${nodeId}_${scope.attemptId}`,
    root = `C:/Alice/${scope.projectId}`
  const grant: OfflineGrant = {
    ...scope,
    kind: 'ALICE_OFFLINE_GRANT_V1',
    grantId: `grant_${nonce}`,
    workspaceRoot: root,
    action,
    tools: n.tools,
    policy,
    authRef: 'authref:fixture_account',
    sessionRef,
    startsAtMs: 0,
    expiresAtMs: 10000,
    nonce,
    approvalRef: `approval_${nonce}`,
    reservationId: `reservation_${nodeId}`,
    budgetUnits: n.maxUnits,
  }
  const request: OfflineRequest = {
    ...scope,
    kind: 'ALICE_OFFLINE_REQUEST_V1',
    action,
    tools: n.tools,
    policy,
    cwd: root,
    authRef: grant.authRef,
    sessionRef,
    costUnits: 0,
  }
  const facts: AuthorityFacts = {
    kind: 'ALICE_OFFLINE_FACTS_V1',
    nowMs: coordinator.snapshot().tick,
    workspaceRoot: root,
    canonicalRoot: root,
    canonicalCwd: root,
    auth: {
      projectId: scope.projectId,
      provider: scope.provider,
      mode: scope.mode,
      authRef: grant.authRef,
    },
    approvedGrant: { grantId: grant.grantId, nonce, approvalRef: grant.approvalRef },
    reservation: {
      projectId: scope.projectId,
      reservationId: grant.reservationId,
      remainingUnits: 15,
    },
    spentNonces: [],
  }
  return { marker: OFFLINE, grant, request, facts }
}
export function finishFixture(coordinator: OfflineCoordinator, nodeId: string) {
  const scope = coordinator.scope(nodeId),
    n = coordinator.snapshot().nodes.find((n) => n.nodeId === nodeId)!,
    codex = scope.provider === 'codex'
  coordinator.ingest(
    nodeId,
    frame(scope, n.cursor + 1, codex ? 'item/agentMessage/delta' : 'fixture.assistant', {
      text: 'Simulated handoff',
    }),
  )
  coordinator.ingest(
    nodeId,
    frame(scope, n.cursor + 2, codex ? 'thread/tokenUsage/updated' : 'fixture.usage', { units: 1 }),
  )
  coordinator.ingest(
    nodeId,
    frame(scope, n.cursor + 3, codex ? 'turn/completed' : 'fixture.result', {
      text: 'Simulated completion',
    }),
  )
}
export function demoRun() {
  const coordinator = new OfflineCoordinator(demoGraph())
  coordinator.start('gg', 'startgg', authorization(coordinator, 'gg', 'noncegg'))
  finishFixture(coordinator, 'gg')
  coordinator.start('codex', 'startcodex', authorization(coordinator, 'codex', 'noncecodex'))
  coordinator.approve(
    'codex',
    'approve',
    'allow',
    'human-fixture',
    authorization(coordinator, 'codex', 'nonceapproval', 'resume'),
  )
  finishFixture(coordinator, 'codex')
  coordinator.start('claude', 'startclaude', authorization(coordinator, 'claude', 'nonceclaude'))
  finishFixture(coordinator, 'claude')
  return coordinator.snapshot()
}
