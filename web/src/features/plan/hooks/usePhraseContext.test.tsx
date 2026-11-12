// SF-chips: outside a QueryClientProvider the hook only says the key; it must not fire GET /api/tags.
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mockApi } from '../test-utils'
import { usePhraseContext } from './usePhraseContext'

describe('usePhraseContext without a provider', () => {
  it('makes no fetch and names the Tag by its key', async () => {
    const api = mockApi({ 'GET /api/tags': [{ id: 1, name: 'Fish', key: 'fish', colour: 'blue', recipes: 3, slotRules: 0, varietyRule: true }] })
    const { result } = renderHook(() => usePhraseContext('2026-11-10'))
    await new Promise((r) => setTimeout(r, 20))
    expect(api.fetchMock).not.toHaveBeenCalled()
    expect(result.current.slotDate).toBe('2026-11-10')
    expect(result.current.tagName('fish')).toBeUndefined()
  })
})
