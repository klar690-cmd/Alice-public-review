import { parseOfflineRequest, PolicyError, rejectSecretMaterial } from './securityPolicy'

/** A separate future live descriptor. It is never an executable or an n8n workflow. */
export function describeOfflineLivePlan(value: unknown) {
  rejectSecretMaterial(value)
  const request = parseOfflineRequest(value)
  if (request.provider === 'claude')
    throw new PolicyError('BLOCKED_UNSUPPORTED_CLAUDE_PERMISSION_CHANNEL')
  return Object.freeze({
    format: 'alice.live-plan.offline.v1' as const,
    executable: false as const,
    brokerRequired: true as const,
    workflowPublished: false as const,
    projectId: request.projectId,
    graphRevision: request.graphRevision,
    nodeId: request.nodeId,
    runId: request.runId,
    attemptId: request.attemptId,
    provider: request.provider,
    mode: request.mode,
    action: request.action,
    tools: Object.freeze([...request.tools]),
    policy: Object.freeze({ ...request.policy }),
    // authRef/sessionRef remain in ephemeral broker input, never in exported graph/workflow data.
  })
}
