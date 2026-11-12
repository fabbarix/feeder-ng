// Beta.5 F7 (Q24): the sort lives in ?sort= and is remembered on the device.
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { RECIPE_SORT_KEY } from '../lib/sortChoice'
import { useRecipeSort } from './useRecipeSort'

const fake = (initial: Record<string, string> = {}) => {
  const m = new Map(Object.entries(initial))
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}
const setup = (url: string, storage: ReturnType<typeof fake> | null) => {
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  return renderHook(() => ({ ...useRecipeSort(storage), loc: useLocation() }), { wrapper })
}

describe('useRecipeSort', () => {
  it('is by name with nothing in the URL and nothing remembered, and leaves the URL alone', () => {
    const { result } = setup('/recipes', fake())
    expect(result.current.sort).toBe('name')
    expect(result.current.loc.search).toBe('')
  })
  it('takes a valid ?sort= from the URL and does not write the device', () => {
    const s = fake()
    const { result } = setup('/recipes?sort=last_cooked_desc', s)
    expect(result.current.sort).toBe('last_cooked_desc')
    expect(s.m.size).toBe(0)
  })
  it('the URL wins over the remembered sort', () => {
    const { result } = setup('/recipes?sort=last_cooked_asc', fake({ [RECIPE_SORT_KEY]: 'last_cooked_desc' }))
    expect(result.current.sort).toBe('last_cooked_asc')
  })
  it('falls to the remembered sort when the URL has none, and writes it to the URL (replacing, other parameters kept)', () => {
    const { result } = setup('/recipes?tag=roast', fake({ [RECIPE_SORT_KEY]: 'last_cooked_desc' }))
    expect(result.current.sort).toBe('last_cooked_desc')
    const params = new URLSearchParams(result.current.loc.search)
    expect(params.get('sort')).toBe('last_cooked_desc')
    expect(params.get('tag')).toBe('roast')
  })
  it('ignores an invalid ?sort= and a remembered garbage value', () => {
    expect(setup('/recipes?sort=newest', fake()).result.current.sort).toBe('name')
    expect(setup('/recipes?sort=newest', fake({ [RECIPE_SORT_KEY]: 'last_cooked_asc' })).result.current.sort).toBe('last_cooked_asc')
    expect(setup('/recipes', fake({ [RECIPE_SORT_KEY]: 'junk' })).result.current.sort).toBe('name')
  })
  it('setSort puts ?sort= in the URL, remembers it, and keeps the other parameters', () => {
    const s = fake()
    const { result } = setup('/recipes?tag=roast', s)
    act(() => result.current.setSort('last_cooked_asc'))
    expect(result.current.sort).toBe('last_cooked_asc')
    const params = new URLSearchParams(result.current.loc.search)
    expect(params.get('sort')).toBe('last_cooked_asc')
    expect(params.get('tag')).toBe('roast')
    expect(s.m.get(RECIPE_SORT_KEY)).toBe('last_cooked_asc')
  })
  it('choosing Name is explicit: ?sort=name, and it replaces a remembered sort', () => {
    const s = fake({ [RECIPE_SORT_KEY]: 'last_cooked_desc' })
    const { result } = setup('/recipes', s)
    act(() => result.current.setSort('name'))
    expect(result.current.sort).toBe('name')
    expect(new URLSearchParams(result.current.loc.search).get('sort')).toBe('name')
    expect(s.m.get(RECIPE_SORT_KEY)).toBe('name')
  })
  it('works without storage', () => {
    const { result } = setup('/recipes', null)
    act(() => result.current.setSort('last_cooked_desc'))
    expect(result.current.sort).toBe('last_cooked_desc')
  })
})
