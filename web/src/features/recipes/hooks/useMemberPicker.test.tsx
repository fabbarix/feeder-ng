import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  members: [
    { id: 1, name: 'Anna', colour: '#fff', avatar: '', portionFactor: 1, userId: 10 },
    { id: 2, name: 'Ben', colour: '#fff', avatar: '', portionFactor: 1, userId: null },
  ],
  me: { id: 10 } as { id: number } | null,
}))
vi.mock('../../settings/hooks/useMembers', () => ({ useMembers: () => ({ members: mocks.members, isPending: false, isError: false }) }))
vi.mock('../../../app/useMe', () => ({ useMe: () => ({ data: mocks.me, isLoading: false }) }))

import { useMemberPicker } from './useMemberPicker'

beforeEach(() => {
  mocks.me = { id: 10 }
})

describe('useMemberPicker', () => {
  it('starts on the signed-in User\'s Member and sends no explicit memberId', () => {
    const { result } = renderHook(() => useMemberPicker())
    expect(result.current.selectedId).toBe(1)
    expect(result.current.memberId).toBeUndefined()
    expect(result.current.members.map((m) => m.name)).toEqual(['Anna', 'Ben'])
  })
  it('picking another Member sets the explicit memberId', () => {
    const { result } = renderHook(() => useMemberPicker())
    act(() => result.current.select([1, 2]))
    expect(result.current.selectedId).toBe(2)
    expect(result.current.memberId).toBe(2)
  })
  it('has no selection for a User without a linked Member until one is picked', () => {
    mocks.me = { id: 99 }
    const { result } = renderHook(() => useMemberPicker())
    expect(result.current.selectedId).toBeNull()
    act(() => result.current.select([2]))
    expect(result.current.memberId).toBe(2)
  })
})
