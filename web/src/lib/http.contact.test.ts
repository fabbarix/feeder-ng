// B9-49 (RES-07): the HTTP client records the time of each OK server answer (lib/serverContact.ts). An error answer, a timeout and a
// network failure are not contact the banner may call "saved": only a successful answer is.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHttpClient } from './http'
import { lastServerContact, resetServerContact } from './serverContact'

beforeEach(() => {
  localStorage.clear()
  resetServerContact()
  vi.useFakeTimers({ now: new Date('2026-11-10T14:30:00Z') })
})

const client = (res: () => Promise<Response>) => createHttpClient({ fetch: vi.fn(res) })

describe('http records the last server contact', () => {
  it('a 200 records now', async () => {
    await client(async () => new Response('{}', { status: 200 })).get('/api/plan')
    expect(lastServerContact()).toEqual(new Date('2026-11-10T14:30:00Z'))
  })

  it('a 204 (a delete) and a write answer count too', async () => {
    const http = client(async () => new Response(null, { status: 204 }))
    await http.delete('/api/x')
    expect(lastServerContact()).toEqual(new Date('2026-11-10T14:30:00Z'))
  })

  it('a 500, a 404 and a 401 are not "saved" moments: nothing is recorded', async () => {
    for (const status of [500, 404, 401]) {
      await client(async () => new Response('{"error":{"code":"x","message":"y"}}', { status })).get('/api/plan').catch(() => {})
    }
    expect(lastServerContact()).toBeNull()
  })

  it('a network failure records nothing (and keeps the earlier moment)', async () => {
    await client(async () => new Response('{}', { status: 200 })).get('/api/plan')
    vi.setSystemTime(new Date('2026-11-10T15:00:00Z'))
    await client(async () => Promise.reject(new TypeError('Failed to fetch'))).get('/api/plan').catch(() => {})
    expect(lastServerContact()).toEqual(new Date('2026-11-10T14:30:00Z'))
  })
})
