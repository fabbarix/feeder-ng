// Sort-drag: the editor hook exposes moveLine (docs/dev/design/sort-drag.md section 6).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { LineDraft } from '../lib/draft'
import { useRecipeEditor } from './useRecipeEditor'

vi.mock('../api', () => ({ recipesApi: { create: vi.fn(), replace: vi.fn(), get: vi.fn(), saveConversion: vi.fn() } }))

const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
const line = (key: string): LineDraft => ({ key, ingredientId: 7, ingredientName: key, quantity: '1', unit: 'g', optional: false, note: '' })

describe('useRecipeEditor.moveLine', () => {
  it('reorders the draft lines by index', () => {
    const { result } = renderHook(() => useRecipeEditor(), { wrapper })
    act(() => result.current.setDraft((d) => ({ ...d, lines: [line('a'), line('b'), line('c')] })))
    act(() => result.current.moveLine(0, 2))
    expect(result.current.draft.lines.map((l) => l.key)).toEqual(['b', 'c', 'a'])
    act(() => result.current.moveLine(2, 1))
    expect(result.current.draft.lines.map((l) => l.key)).toEqual(['b', 'a', 'c'])
  })
  it('keeps the field values of each line (the typed quantity travels with its line)', () => {
    const { result } = renderHook(() => useRecipeEditor(), { wrapper })
    act(() => result.current.setDraft((d) => ({ ...d, lines: [{ ...line('a'), quantity: '3' }, line('b')] })))
    act(() => result.current.moveLine(0, 1))
    expect(result.current.draft.lines[1]).toMatchObject({ key: 'a', quantity: '3' })
  })
})
