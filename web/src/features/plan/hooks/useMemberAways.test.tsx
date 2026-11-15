// B9-46: the Aways of one Member, or of every Member at once (the Members list).
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mockApi, wrapper } from '../test-utils'
import type { Away } from '../types'
import { useAllMemberAways, useMemberAways } from './useMemberAways'

const away = (over: Partial<Away> = {}): Away => ({ id: 1, memberId: 2, memberName: 'Ben', from: '2026-11-20', fromMealSlotId: null, through: '2026-11-27', throughMealSlotId: null, started: false, ...over })

describe('useMemberAways', () => {
  it('reads GET /api/members/{id}/away, soonest first as sent', async () => {
    const api = mockApi({ 'GET /api/members/2/away': [away(), away({ id: 2, from: '2026-12-01', through: null })] })
    const { result } = renderHook(() => useMemberAways(2), { wrapper })
    await waitFor(() => expect(result.current.aways).toHaveLength(2))
    expect(result.current.aways.map((a) => a.id)).toEqual([1, 2])
    expect(api.callsTo('GET', '/api/members/2/away')).toHaveLength(1)
  })

  it('reads nothing for a null Member, and says no Aways meanwhile', () => {
    const api = mockApi({})
    const { result } = renderHook(() => useMemberAways(null), { wrapper })
    expect(result.current.aways).toEqual([])
    expect(api.calls).toHaveLength(0)
  })

  it('a refused read gives no Aways, never a throw', async () => {
    mockApi({ 'GET /api/members/2/away': { status: 500, json: { error: { code: 'internal', message: 'no' } } } })
    const { result } = renderHook(() => useMemberAways(2), { wrapper })
    await waitFor(() => expect(result.current.state).not.toBe('loading'))
    expect(result.current.aways).toEqual([])
  })
})

describe('useAllMemberAways', () => {
  it('returns the Aways by Member id; a Member whose read fails is simply missing', async () => {
    mockApi({
      'GET /api/members/1/away': [],
      'GET /api/members/2/away': [away()],
      'GET /api/members/3/away': { status: 500, json: { error: { code: 'internal', message: 'no' } } },
    })
    const { result } = renderHook(() => useAllMemberAways([1, 2, 3]), { wrapper })
    await waitFor(() => expect(result.current[2]).toHaveLength(1))
    expect(result.current[1] ?? []).toEqual([])
    expect(result.current[3] ?? []).toEqual([])
  })
})
