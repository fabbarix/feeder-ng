import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, wrapper } from '../../settings/test-utils'
import type { AccessRequest } from '../types'
import { useAccessBadge } from './useAccessBadge'
import { useAccessRequests } from './useAccessRequests'
import { useUnlinkedMembers } from './useUnlinkedMembers'
import { useWaitingStatus } from './useWaitingStatus'

afterEach(() => vi.unstubAllGlobals())

const zia: AccessRequest = {
  id: 5, email: 'zia@example.test', name: 'Zia Rosa', picture: '', requestedAt: '2026-11-09T12:00:00Z', expiresAt: '2026-11-23T12:00:00Z',
}

describe('useAccessRequests', () => {
  it('loads the pending requests, oldest first', async () => {
    const older = { ...zia, id: 4, email: 'old@example.test', requestedAt: '2026-11-08T12:00:00Z' }
    mockApi({ 'GET /api/access-requests': { requests: [zia, older], count: 2 } })
    const { result } = renderHook(() => useAccessRequests(), { wrapper })
    await waitFor(() => expect(result.current.requests).toHaveLength(2))
    expect(result.current.requests.map((r) => r.id)).toEqual([4, 5])
  })

  it('approve POSTs and refetches', async () => {
    let list = [zia]
    const api = mockApi({
      'GET /api/access-requests': () => ({ requests: list, count: list.length }),
      'POST /api/access-requests/5/approve': () => {
        list = []
        return { id: 9, email: zia.email, displayName: 'Zia Rosa', isAdmin: false }
      },
    })
    const { result } = renderHook(() => useAccessRequests(), { wrapper })
    await waitFor(() => expect(result.current.requests).toHaveLength(1))
    await act(() => result.current.approve(5))
    expect(api.callsTo('POST', '/api/access-requests/5/approve')).toHaveLength(1)
    await waitFor(() => expect(result.current.requests).toHaveLength(0))
  })

  it('approve sends the chosen Member so the User is linked in the same step (A3)', async () => {
    let list = [zia]
    const api = mockApi({
      'GET /api/access-requests': () => ({ requests: list, count: list.length }),
      'POST /api/access-requests/5/approve': () => {
        list = []
        return { id: 9, email: zia.email, displayName: 'Zia Rosa', isAdmin: false }
      },
    })
    const { result } = renderHook(() => useAccessRequests(), { wrapper })
    await waitFor(() => expect(result.current.requests).toHaveLength(1))
    await act(() => result.current.approve(5, 3))
    expect(api.callsTo('POST', '/api/access-requests/5/approve')[0]?.body).toEqual({ memberId: 3 })
  })

  it('approve without a Member sends no memberId', async () => {
    const api = mockApi({
      'GET /api/access-requests': { requests: [zia], count: 1 },
      'POST /api/access-requests/5/approve': { id: 9, email: zia.email, displayName: 'Zia Rosa', isAdmin: false },
    })
    const { result } = renderHook(() => useAccessRequests(), { wrapper })
    await waitFor(() => expect(result.current.requests).toHaveLength(1))
    await act(() => result.current.approve(5))
    const body = api.callsTo('POST', '/api/access-requests/5/approve')[0]?.body as { memberId?: number } | undefined
    expect(body?.memberId).toBeUndefined()
  })

  it('a refused Member rejects with the server error', async () => {
    mockApi({
      'GET /api/access-requests': { requests: [zia], count: 1 },
      'POST /api/access-requests/5/approve': { status: 409, json: { error: { code: 'member_unavailable', message: 'x' } } },
    })
    const { result } = renderHook(() => useAccessRequests(), { wrapper })
    await waitFor(() => expect(result.current.requests).toHaveLength(1))
    await expect(result.current.approve(5, 3)).rejects.toMatchObject({ status: 409, code: 'member_unavailable' })
  })

  it('deny POSTs and refetches', async () => {
    let list = [zia]
    const api = mockApi({
      'GET /api/access-requests': () => ({ requests: list, count: list.length }),
      'POST /api/access-requests/5/deny': () => {
        list = []
        return { status: 204 }
      },
    })
    const { result } = renderHook(() => useAccessRequests(), { wrapper })
    await waitFor(() => expect(result.current.requests).toHaveLength(1))
    await act(() => result.current.deny(5))
    expect(api.callsTo('POST', '/api/access-requests/5/deny')).toHaveLength(1)
    await waitFor(() => expect(result.current.requests).toHaveLength(0))
  })

  it('rejects with the server error, for example when somebody else answered first', async () => {
    mockApi({
      'GET /api/access-requests': { requests: [zia], count: 1 },
      'POST /api/access-requests/5/approve': { status: 404, json: { error: { code: 'not_found', message: 'Not found' } } },
    })
    const { result } = renderHook(() => useAccessRequests(), { wrapper })
    await waitFor(() => expect(result.current.requests).toHaveLength(1))
    await expect(result.current.approve(5)).rejects.toMatchObject({ status: 404 })
  })
})

describe('useAccessBadge', () => {
  it('is the pending count', async () => {
    mockApi({ 'GET /api/access-requests': { requests: [zia], count: 1 } })
    const { result } = renderHook(() => useAccessBadge(), { wrapper })
    await waitFor(() => expect(result.current).toBe(1))
  })
  it('is 0 while loading and when the call fails', async () => {
    mockApi({ 'GET /api/access-requests': { status: 500, json: { error: { code: 'internal', message: 'x' } } } })
    const { result } = renderHook(() => useAccessBadge(), { wrapper })
    expect(result.current).toBe(0)
    await new Promise((r) => setTimeout(r, 20))
    expect(result.current).toBe(0)
  })
})

describe('useWaitingStatus', () => {
  it('reads the visitor status', async () => {
    mockApi({ 'GET /api/access-request/status': { json: { status: 'pending', email: 'zia@example.test', name: 'Zia Rosa' } } })
    const { result } = renderHook(() => useWaitingStatus(), { wrapper })
    await waitFor(() => expect(result.current.status?.status).toBe('pending'))
    expect(result.current.status?.email).toBe('zia@example.test')
    expect(result.current.isPending).toBe(false)
  })
})

describe('useUnlinkedMembers', () => {
  it('lists the Members that have no User yet', async () => {
    mockApi({
      'GET /api/members': [
        { id: 1, name: 'Sam', userId: 4 },
        { id: 3, name: 'Nonna', userId: null },
      ],
    })
    const { result } = renderHook(() => useUnlinkedMembers(), { wrapper })
    await waitFor(() => expect(result.current.members.map((m) => m.name)).toEqual(['Nonna']))
    expect(result.current.isError).toBe(false)
  })
  it('reports a failure so the sheet can still approve without linking', async () => {
    mockApi({ 'GET /api/members': { status: 500, json: { error: { code: 'internal', message: 'x' } } } })
    const { result } = renderHook(() => useUnlinkedMembers(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.members).toEqual([])
  })
})
