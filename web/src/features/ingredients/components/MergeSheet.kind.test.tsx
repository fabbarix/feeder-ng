// H5: the merge sheet says kind_differs in words (preview blocked, and the merge's own 409).
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { dishSoapJSON, garlicJSON } from '../supply.test-helper'
import type { Ingredient, MergePreview } from '../types'

const preview: MergePreview = {
  source: dishSoapJSON, target: garlicJSON, blocked: 'kind_differs', conversions: [], shelfLifeDays: null, conflicts: [],
  sourceReferences: {}, targetReferences: {},
}
const flow = {
  query: '', setQuery: vi.fn(), candidates: [garlicJSON], target: garlicJSON as Ingredient | null, selectTarget: vi.fn(),
  preview: preview as MergePreview | undefined, isLoading: false, answers: {}, answer: vi.fn(), canMerge: true,
  merge: vi.fn(() => Promise.reject(new ApiError(409, 'kind_differs', 'kind_differs'))),
}
const useMergeFlow = vi.fn((_id: number, _kind?: string) => flow)
vi.mock('../hooks/useMergeFlow', () => ({ useMergeFlow: (id: number, kind?: string) => useMergeFlow(id, kind) }))
vi.mock('../hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))

import { MergeSheet } from './MergeSheet'

const WORDS = "One is food and the other is a Supply, so they can't be merged"

describe('MergeSheet: kind_differs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    flow.preview = preview
    flow.canMerge = true
  })
  it('says it in words, as an alert, and offers no Merge button', () => {
    render(<MergeSheet open sourceId={21} kind="supply" onClose={() => {}} onMerged={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent(WORDS)
    expect(screen.queryByRole('button', { name: 'Merge' })).toBeNull()
    expect(screen.queryByText(/different Base Units/)).toBeNull()
  })
  it('keeps the Base Unit words for base_unit_mismatch', () => {
    flow.preview = { ...preview, blocked: 'base_unit_mismatch' }
    render(<MergeSheet open sourceId={21} kind="supply" onClose={() => {}} onMerged={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent("These Supplies count in different Base Units, so they can't be merged")
  })
  it('words the sheet for a Supply, and keeps the Ingredient words for food', () => {
    flow.target = null
    const { unmount } = render(<MergeSheet open sourceId={21} kind="supply" onClose={() => {}} onMerged={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Merge Supply' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Find the Supply to keep' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Matching Supplies' })).toBeInTheDocument()
    unmount()
    render(<MergeSheet open sourceId={7} onClose={() => {}} onMerged={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Merge Ingredient' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Find the Ingredient to keep' })).toBeInTheDocument()
    flow.target = garlicJSON
  })
  it('hands its kind to the flow (default food)', () => {
    render(<MergeSheet open sourceId={21} kind="supply" onClose={() => {}} onMerged={() => {}} />)
    expect(useMergeFlow).toHaveBeenCalledWith(21, 'supply')
    render(<MergeSheet open sourceId={7} onClose={() => {}} onMerged={() => {}} />)
    expect(useMergeFlow).toHaveBeenCalledWith(7, 'food')
  })
  it('words the merge\'s own 409 kind_differs', async () => {
    flow.preview = { ...preview, blocked: '' }
    render(<MergeSheet open sourceId={21} kind="supply" onClose={() => {}} onMerged={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Merge' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(WORDS)
  })
})
