// DS-TODAY: the one place Today reads the Shop list (kept out of seams.ts, whose tests mock ../shop with ShoppingScreen only).
// "Lines to get" = the Lines of the default Shopping List that are not ticked yet.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ list: { data: undefined, isLoading: false } as Record<string, unknown> }))
vi.mock('../shop/hooks/useShoppingList', () => ({ useShoppingList: () => h.list })) // w6a: shopSeam imports it by path

import { useLinesToGet } from './shopSeam'

const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>

describe('useLinesToGet', () => {
  it('counts the Lines not ticked', () => {
    h.list = { data: { lines: [{ ticked: false }, { ticked: true }, { ticked: false }] }, isLoading: false }
    expect(renderHook(() => useLinesToGet(), { wrapper }).result.current).toEqual({ count: 2, loading: false })
  })

  it('is 0 and loading while the list loads, 0 when it failed or is empty', () => {
    h.list = { data: undefined, isLoading: true }
    expect(renderHook(() => useLinesToGet(), { wrapper }).result.current).toEqual({ count: 0, loading: true })
    h.list = { data: undefined, isLoading: false }
    expect(renderHook(() => useLinesToGet(), { wrapper }).result.current).toEqual({ count: 0, loading: false })
  })
})

describe('Today keeps the Shopping List screen out of the entry chunk (w6a, B9-44 TB-12)', () => {
  it('no Today module imports the shop barrel (it re-exports ShoppingScreen); hooks come by path', async () => {
    const { readFileSync, readdirSync } = await import('node:fs')
    const { join, resolve } = await import('node:path')
    const root = resolve(__dirname)
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [join(dir, e.name)] : []))
    for (const f of files(root)) expect(readFileSync(f, 'utf8'), f).not.toMatch(/from '(\.\.\/)+shop'/)
  })
})
