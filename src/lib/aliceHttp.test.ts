// @vitest-environment node
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDemoConnections } from '../preview/data'
import { createLiveEvent } from './aliceCanonical'
import { browserAliceHttp, n8nRequestUrl, requestN8n } from './aliceHttp'

describe('real n8n HTTP transport', () => {
  let baseUrl = ''
  let requests = 0
  let postRequests = 0
  let received: unknown
  const server = createServer(async (req, res) => {
    if (req.url === '/healthz') {
      requests++
      res.writeHead(requests === 1 ? 503 : 200).end('{}')
      return
    }
    if (req.url === '/webhook/slow') {
      setTimeout(() => res.end('{}'), 300)
      return
    }
    if (req.url === '/webhook/failure') {
      postRequests++
      res.writeHead(503).end('{}')
      return
    }
    if (req.url === '/webhook/alice') {
      let body = ''
      for await (const chunk of req) body += chunk
      received = JSON.parse(body)
      res.writeHead(202).end('response-must-not-be-stored')
      return
    }
    res.writeHead(404).end('{}')
  })
  beforeAll(async () => {
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    baseUrl = 'http://127.0.0.1:' + (server.address() as AddressInfo).port
  })
  afterAll(async () => {
    server.closeAllConnections()
    await new Promise<void>((r) => server.close(() => r()))
  })
  it('health is real GET, retries once and normalizes status', async () => {
    const result = await requestN8n({ baseUrl, path: 'healthz' }, browserAliceHttp)
    expect(result).toEqual({ ok: true, status: 200, error: null, attempts: 2 })
    expect(requests).toBe(2)
  })
  it('POSTs only the normalized identity envelope once', async () => {
    const event = createLiveEvent(
      createDemoConnections(),
      'demo-assistente',
      'alice-demo',
      'connection.test',
    )
    const result = await requestN8n({ baseUrl, path: 'webhook/alice', event }, browserAliceHttp)
    expect(result.status).toBe(202)
    expect(received).toEqual(event)
    expect(result).not.toHaveProperty('body')
    expect(event).toMatchObject({
      project_id: 'alice-demo',
      account_id: 'demo-cli',
      agent_id: 'demo-assistente',
      session_id: 'demo-pty-disabled',
    })
    expect(event).toHaveProperty('timestamp')
    expect(event).toHaveProperty('correlation_id')
  })
  it('never retries failed POST; timeout/offline do not block startup', async () => {
    const event = createLiveEvent(
      createDemoConnections(),
      'demo-assistente',
      'alice-demo',
      'connection.test',
    )
    expect(
      (await requestN8n({ baseUrl, path: 'webhook/failure', event }, browserAliceHttp)).attempts,
    ).toBe(1)
    expect(postRequests).toBe(1)
    expect(
      (await requestN8n({ baseUrl, path: 'webhook/slow', timeoutMs: 100, event }, browserAliceHttp))
        .error,
    ).toBe('timeout')
    expect(
      (await requestN8n({ baseUrl: 'http://127.0.0.1:1', path: 'healthz' }, browserAliceHttp))
        .error,
    ).toBe('offline')
  })
  it('rejects unapproved canonical execution at the transport boundary', () => {
    const event = {
      ...createLiveEvent(
        createDemoConnections(),
        'demo-assistente',
        'alice-demo',
        'connection.test',
      ),
      action: 'canonical.dispatch.requested' as const,
    }
    expect(() => n8nRequestUrl({ baseUrl, path: 'webhook/alice', event })).toThrow()
  })
  it('rejects credentials, traversal, arbitrary APIs and invalid protocols', () => {
    for (const baseUrl of ['javascript:x', 'https://u:p@host', 'https://host?token=x'])
      expect(() => n8nRequestUrl({ baseUrl, path: 'healthz' })).toThrow()
    for (const path of [
      '../secret',
      'api/v1/credentials',
      'webhook/../token',
      'webhook/x?secret=x',
    ])
      expect(() => n8nRequestUrl({ baseUrl, path })).toThrow()
  })
})
