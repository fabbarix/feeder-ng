// Beta.5 F7 (Q24): the sort remembered on this device.
import { describe, expect, it } from 'vitest'
import { RECIPE_SORT_KEY, getStoredSort, setStoredSort } from './sortChoice'

const fake = () => {
  const m = new Map<string, string>()
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}
const throwing = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
  removeItem: () => {
    throw new Error('blocked')
  },
}

describe('the remembered Recipes sort', () => {
  it('keeps the sort under a feeder.* key and reads it back', () => {
    const s = fake()
    setStoredSort(s, 'last_cooked_desc')
    expect(RECIPE_SORT_KEY).toMatch(/^feeder\./)
    expect(s.m.get(RECIPE_SORT_KEY)).toBe('last_cooked_desc')
    expect(getStoredSort(s)).toBe('last_cooked_desc')
  })
  it('reads null when nothing is stored', () => {
    expect(getStoredSort(fake())).toBeNull()
  })
  it('never throws when storage is missing or blocked', () => {
    expect(getStoredSort(null)).toBeNull()
    expect(getStoredSort(undefined)).toBeNull()
    expect(getStoredSort(throwing)).toBeNull()
    expect(() => setStoredSort(throwing, 'name')).not.toThrow()
    expect(() => setStoredSort(null, 'name')).not.toThrow()
  })
})
