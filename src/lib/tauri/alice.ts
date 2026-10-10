import { invoke } from '@tauri-apps/api/core'

import type { AliceHttpRequest } from '../aliceHttp'
import type { AliceHttpResult } from '../types'
export function aliceN8nRequest(request: AliceHttpRequest): Promise<AliceHttpResult> {
  return invoke('alice_n8n_request', { request })
}
export function aliceGithubRead(
  repository: string,
  reference: string,
  path: string,
): Promise<string> {
  return invoke('alice_github_read', { repository, reference, path })
}
