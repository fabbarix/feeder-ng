import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHashTarget } from './useHashTarget'

const at = (entry: string) => ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[entry]}>{children}</MemoryRouter>
let scroll: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  scroll = vi.fn()
  Element.prototype.scrollIntoView = scroll as unknown as typeof Element.prototype.scrollIntoView
  document.body.innerHTML = '<table><tbody><tr id="preference-member-2"></tr></tbody></table>'
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useHashTarget', () => {
  it('returns the number after the prefix and scrolls that element into view', () => {
    const { result } = renderHook(() => useHashTarget('preference-member-'), { wrapper: at('/recipes/3#preference-member-2') })
    expect(result.current).toBe(2)
    expect(scroll).toHaveBeenCalledOnce()
    expect(scroll.mock.instances[0]).toBe(document.getElementById('preference-member-2'))
  })
  it('stops highlighting after about two seconds', () => {
    const { result } = renderHook(() => useHashTarget('preference-member-'), { wrapper: at('/recipes/3#preference-member-2') })
    act(() => void vi.advanceTimersByTime(2600))
    expect(result.current).toBeNull()
  })
  it('is null without a hash, with another hash, or for an element that is not there', () => {
    for (const entry of ['/recipes/3', '/recipes/3#steps', '/recipes/3#preference-member-9']) {
      const { result } = renderHook(() => useHashTarget('preference-member-'), { wrapper: at(entry) })
      expect(result.current, entry).toBeNull()
    }
    expect(scroll).not.toHaveBeenCalled()
  })
  it('scrolls smoothly, and without animation when the User prefers reduced motion', () => {
    renderHook(() => useHashTarget('preference-member-'), { wrapper: at('/recipes/3#preference-member-2') })
    expect(scroll).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: 'smooth' }))
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: /prefers-reduced-motion:\s*reduce/.test(query), media: query, addEventListener() {}, removeEventListener() {} }))
    renderHook(() => useHashTarget('preference-member-'), { wrapper: at('/recipes/3#preference-member-2') })
    expect(scroll).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: 'auto' }))
  })
})
