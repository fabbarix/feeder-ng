import { describe, expect, it } from 'vitest'
import { getLastShopId, LAST_SHOP_KEY, setLastShopId } from './lastShop'

function mem(initial: Record<string, string> = {}) {
  const d = { ...initial }
  return { getItem: (k: string) => d[k] ?? null, setItem: (k: string, v: string) => void (d[k] = v), removeItem: (k: string) => void delete d[k], d }
}

describe('last Shop', () => {
  it('remembers and forgets', () => {
    const s = mem()
    expect(getLastShopId(s)).toBeNull()
    setLastShopId(s, 3)
    expect(s.d[LAST_SHOP_KEY]).toBe('3')
    expect(getLastShopId(s)).toBe(3)
    setLastShopId(s, null)
    expect(getLastShopId(s)).toBeNull()
  })

  it.each([['abc'], ['0'], ['-2'], ['1.5'], ['']])('ignores the stored value %j', (v) => {
    expect(getLastShopId(mem({ [LAST_SHOP_KEY]: v }))).toBeNull()
  })

  it('survives missing or throwing storage', () => {
    const bad = {
      getItem: () => {
        throw new Error('x')
      },
      setItem: () => {
        throw new Error('x')
      },
      removeItem: () => {
        throw new Error('x')
      },
    }
    for (const s of [null, undefined, bad]) {
      expect(getLastShopId(s)).toBeNull()
      expect(() => setLastShopId(s, 1)).not.toThrow()
    }
  })
})
