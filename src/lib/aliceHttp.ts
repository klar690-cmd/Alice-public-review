import { isAlicePreview } from './aliceEnvironment'
import { safeConnectionUrl } from './aliceModel'
import { aliceN8nRequest } from './tauri/alice'
import type { AliceHttpResult, AliceLiveEvent } from './types'

export type AliceHttpRequest = {
  baseUrl: string
  path: string
  event?: AliceLiveEvent
  timeoutMs?: number
}
export type AliceHttpTransport = (request: AliceHttpRequest) => Promise<AliceHttpResult>
export function n8nRequestUrl(request: AliceHttpRequest): string {
  if (request.event && request.event.action !== 'connection.test')
    throw new Error('alice.canonicalMismatch')
  const base = safeConnectionUrl(request.baseUrl)
  if (
    !base ||
    !/^(healthz|healthz\/readiness|webhook(?:-test)?\/[a-zA-Z0-9_/-]{1,160})$/.test(request.path) ||
    request.path.includes('..')
  )
    throw new Error('alice.invalidUrl')
  return base.replace(/\/$/, '') + '/' + request.path
}
export const browserAliceHttp: AliceHttpTransport = async (request) => {
  let url: string
  try {
    url = n8nRequestUrl(request)
  } catch {
    return { ok: false, status: null, error: 'invalid-config', attempts: 0 }
  }
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    Math.max(100, Math.min(request.timeoutMs ?? 5000, 10000)),
  )
  try {
    const response = await fetch(url, {
      method: request.event ? 'POST' : 'GET',
      headers: request.event ? { 'Content-Type': 'application/json' } : {},
      body: request.event ? JSON.stringify(request.event) : undefined,
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
    })
    // Do not retain endpoint response bodies: they may contain credentials or unrelated user data.
    await response.body?.cancel()
    return {
      ok: response.ok,
      status: response.status,
      error: response.ok ? null : 'http',
      attempts: 1,
    }
  } catch {
    return {
      ok: false,
      status: null,
      error: controller.signal.aborted ? 'timeout' : 'offline',
      attempts: 1,
    }
  } finally {
    clearTimeout(timer)
  }
}
const runtimeHttp: AliceHttpTransport = (request) =>
  isAlicePreview ? browserAliceHttp(request) : aliceN8nRequest(request)
export async function requestN8n(
  request: AliceHttpRequest,
  transport: AliceHttpTransport = runtimeHttp,
): Promise<AliceHttpResult> {
  try {
    n8nRequestUrl(request)
  } catch {
    return { ok: false, status: null, error: 'invalid-config', attempts: 0 }
  }
  // Only health reads are retried. A webhook may already have executed before the response is lost.
  const limit = request.event ? 1 : 2
  let result: AliceHttpResult = { ok: false, status: null, error: 'offline', attempts: 0 }
  for (let attempt = 1; attempt <= limit; attempt++) {
    try {
      result = await transport(request)
    } catch {
      result = { ok: false, status: null, error: 'offline', attempts: attempt }
    }
    result = { ...result, attempts: attempt }
    if (
      result.ok ||
      result.error === 'invalid-config' ||
      (result.status !== null && result.status < 500)
    )
      break
  }
  return result
}
