import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LAST_SHOP_KEY } from '../../scan/lib/lastShop'

const shopsHook = vi.hoisted(() => ({ useShops: vi.fn() }))
vi.mock('../../shops/hooks/useShops', () => shopsHook)

import { useShopChoice } from './useShopChoice'

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
    removeItem: (k: string) => void delete data[k],
  }
}

const shops = [
  { id: 1, name: 'Aldi' },
  { id: 2, name: 'Coop' },
]

beforeEach(() => {
  shopsHook.useShops.mockReset().mockReturnValue({ shops, isLoading: false, error: null, add: vi.fn() })
})

describe('useShopChoice (G3)', () => {
  it('starts on the last Shop used and lists the Shops', () => {
    const { result } = renderHook(() => useShopChoice(memory({ [LAST_SHOP_KEY]: '2' })))
    expect(result.current.shopId).toBe(2)
    expect(result.current.shops).toEqual(shops)
  })

  it('has no Shop picked when none was used yet', () => {
    const { result } = renderHook(() => useShopChoice(memory()))
    expect(result.current.shopId).toBeNull()
  })

  it('picking a Shop remembers it for the Scan screen too', () => {
    const storage = memory()
    const { result } = renderHook(() => useShopChoice(storage))
    act(() => result.current.setShopId(1))
    expect(result.current.shopId).toBe(1)
    expect(storage.data[LAST_SHOP_KEY]).toBe('1')
  })

  it('trusts the stored id while the Shops load', () => {
    shopsHook.useShops.mockReturnValue({ shops: [], isLoading: true, error: null, add: vi.fn() })
    const { result } = renderHook(() => useShopChoice(memory({ [LAST_SHOP_KEY]: '2' })))
    expect(result.current.shopId).toBe(2)
    expect(result.current.isLoading).toBe(true)
  })

  it('drops a Shop that no longer exists', () => {
    const storage = memory({ [LAST_SHOP_KEY]: '99' })
    const { result } = renderHook(() => useShopChoice(storage))
    expect(result.current.shopId).toBeNull()
    expect(storage.data[LAST_SHOP_KEY]).toBeUndefined()
  })

  it('works where storage is unavailable', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {},
    }
    const { result } = renderHook(() => useShopChoice(broken))
    expect(result.current.shopId).toBeNull()
    act(() => result.current.setShopId(2))
    expect(result.current.shopId).toBe(2)
  })
})
