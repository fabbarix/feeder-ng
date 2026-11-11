// R11a: useBreadcrumbs(entityName?) reads the current location and returns crumbsFor(pathname, entityName).
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { useBreadcrumbs } from './useBreadcrumbs'

const at = (path: string) => ({ wrapper: ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter> })

describe('useBreadcrumbs', () => {
  it('returns the trail of the current route', () => {
    const { result } = renderHook(() => useBreadcrumbs(), at('/settings/meal-slots'))
    expect(result.current).toEqual([{ label: 'Settings', to: '/settings' }, { label: 'Meal Slots' }])
  })

  it('uses the entity name for the :id crumb, and the GLOSSARY fallback while it is undefined', () => {
    const { result, rerender } = renderHook(({ name }: { name?: string }) => useBreadcrumbs(name), { ...at('/ingredients/3'), initialProps: {} as { name?: string } })
    expect(result.current.at(-1)).toEqual({ label: 'Ingredient' })
    rerender({ name: 'Garlic' })
    expect(result.current.at(-1)).toEqual({ label: 'Garlic' })
  })

  it('is empty on a screen with no hierarchy', () => {
    const { result } = renderHook(() => useBreadcrumbs(), at('/recipes'))
    expect(result.current).toEqual([])
  })

  it('keeps the same array while nothing changes (safe as a prop)', () => {
    const { result, rerender } = renderHook(() => useBreadcrumbs('Coop'), at('/settings/shops/4'))
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })
})
