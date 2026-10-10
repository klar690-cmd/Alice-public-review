import type { Scope } from '../securityPolicy'
import { type FixtureFrame, OFFLINE } from './contracts'

/** Fixture naming is intentional: no claim of official wire compatibility. */
export function frame(
  scope: Scope,
  sequence: number,
  name: string,
  data: Record<string, unknown>,
): FixtureFrame {
  return {
    marker: OFFLINE,
    schemaVersion: 1,
    scope,
    sequence,
    wire: scope.provider === 'codex' ? { method: name, params: data } : { type: name, body: data },
  }
}
export function fixtureScope(provider: 'codex' | 'claude' = 'codex', nodeId = 'codex'): Scope {
  return {
    projectId: 'projectA',
    graphRevision: 1,
    nodeId,
    runId: 'run1',
    attemptId: 'attempt1',
    provider,
    mode: provider === 'codex' ? 'local-app-server' : 'local-cli-json',
  }
}
export function successTranscript(scope: Scope): readonly FixtureFrame[] {
  const names =
    scope.provider === 'codex'
      ? [
          'thread/start',
          'turn/start',
          'item/agentMessage/delta',
          'thread/tokenUsage/updated',
          'artifact/record',
          'turn/completed',
        ]
      : [
          'fixture.init',
          'fixture.user',
          'fixture.assistant',
          'fixture.usage',
          'fixture.artifact',
          'fixture.result',
        ]
  return [
    frame(scope, 1, names[0], { fixtureSessionId: `fixture_${scope.nodeId}` }),
    frame(scope, 2, names[1], { text: 'Simulated assignment' }),
    frame(scope, 3, names[2], { text: 'Simulated response' }),
    frame(scope, 4, names[3], { units: 1 }),
    frame(scope, 5, names[4], { artifactId: 'artifact1', summary: 'Simulated artifact' }),
    frame(scope, 6, names[5], { text: 'Simulated result' }),
  ]
}
