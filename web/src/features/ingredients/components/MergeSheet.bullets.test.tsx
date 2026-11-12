// SF-misc: the options of "Merge into another Ingredient" showed browser list bullets (a bare <ul>). They are ListRows in a ListGroup now.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { declarations, readUiCss } from '../../../ui/test-utils'
import type { Ingredient } from '../types'

const puree: Ingredient = { id: 9, name: 'tomato puree', baseUnit: 'ml', shelfLifeDays: 9, conversions: [] }
vi.mock('../hooks/useMergeFlow', () => ({
  useMergeFlow: () => ({
    query: '', setQuery: vi.fn(), candidates: [puree], target: null, selectTarget: vi.fn(), preview: undefined,
    isLoading: false, answers: {}, answer: vi.fn(), canMerge: false, merge: vi.fn(),
  }),
}))
vi.mock('../hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))

import { MergeSheet } from './MergeSheet'

describe('MergeSheet, no list bullets', () => {
  it('lists the candidates in the shared ListGroup, whose list has list-style: none', () => {
    render(<MergeSheet open sourceId={4} onClose={() => {}} onMerged={() => {}} />)
    const list = screen.getByRole('button', { name: /tomato puree/ }).closest('ul')
    expect(list).not.toBeNull()
    expect(list!.className).toContain('list-group__list')
    expect(declarations(readUiCss('ListRow.css'), '.list-group__list')['list-style']).toBe('none')
  })
})
