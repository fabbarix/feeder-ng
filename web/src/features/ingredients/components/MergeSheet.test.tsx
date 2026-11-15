import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { strings } from '../strings'
import type { Ingredient, MergePreview } from '../types'

const passata: Ingredient = { id: 4, name: 'passata', baseUnit: 'ml', shelfLifeDays: 5, conversions: [{ unit: 'jar', toBase: 700 }] }
const puree: Ingredient = { id: 9, name: 'tomato puree', baseUnit: 'ml', shelfLifeDays: 9, conversions: [{ unit: 'jar', toBase: 680 }] }
const preview: MergePreview = {
  source: passata, target: puree, blocked: '', conversions: [], shelfLifeDays: null,
  conflicts: [{ kind: 'conversion', unit: 'jar', source: 700, target: 680 }],
  sourceReferences: { 'recipe lines': 3, products: 1 }, targetReferences: {},
}
const flow = {
  query: '', setQuery: vi.fn(), candidates: [puree], target: null as Ingredient | null, selectTarget: vi.fn(),
  preview: undefined as MergePreview | undefined, isLoading: false, answers: {}, answer: vi.fn(),
  canMerge: false, merge: vi.fn((onMerged?: (s: Ingredient) => void) => { onMerged?.(puree); return Promise.resolve(puree) }),
}
vi.mock('../hooks/useMergeFlow', () => ({ useMergeFlow: () => flow }))
vi.mock('../hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))

import { MergeSheet } from './MergeSheet'

const render_ = (onMerged = vi.fn()) => {
  render(<MergeSheet open sourceId={4} onClose={() => {}} onMerged={onMerged} />)
  return onMerged
}

describe('MergeSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    flow.target = null
    flow.preview = undefined
    flow.canMerge = false
  })
  it('first asks which Ingredient to keep', async () => {
    render_()
    await userEvent.type(screen.getByLabelText(strings.mergeFindLabel), 't')
    expect(flow.setQuery).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /tomato puree/ }))
    expect(flow.selectTarget).toHaveBeenCalledWith(puree)
  })
  it('summarises the merge, the places that move, and the conflicts', () => {
    flow.target = puree
    flow.preview = preview
    render_()
    expect(screen.getByText(strings.mergeSummary('passata', 'tomato puree'))).toBeInTheDocument()
    // B9-48 (SAFE-02, R-E): what moves is rows under "Moves to <target>", not the sentence "4 places will move".
    expect(screen.queryByText(strings.mergeMoves(4))).toBeNull()
    const moves = screen.getByRole('list', { name: 'Moves to Tomato puree' })
    expect(within(moves).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Recipe lines3', 'Products1'])
    expect(screen.getByRole('radio', { name: 'Keep 700 ml' })).toBeInTheDocument()
  })
  it('shows no "Moves to" rows when nothing refers to the source', () => {
    flow.target = puree
    flow.preview = { ...preview, sourceReferences: {} }
    render_()
    expect(screen.queryByRole('list', { name: /^Moves to/ })).toBeNull()
  })
  it('a blocked merge is the sheet\'s one form-level alert (FormError), and a refused merge too', async () => {
    flow.target = puree
    flow.preview = { ...preview, blocked: 'base_unit_mismatch', conflicts: [] }
    render_()
    expect(screen.getByRole('alert')).toHaveClass('form-error')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })
  it('a merge the server refuses stays on the sheet with one FormError, nothing else lost', async () => {
    flow.target = puree
    flow.preview = preview
    flow.canMerge = true
    flow.merge.mockRejectedValueOnce(new Error('boom'))
    render_()
    await userEvent.click(screen.getByRole('button', { name: strings.mergeConfirm }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveClass('form-error')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })
  it('keeps Merge disabled until every conflict is answered', () => {
    flow.target = puree
    flow.preview = preview
    render_()
    expect(screen.getByRole('button', { name: strings.mergeConfirm })).toBeDisabled()
  })
  it('merges once resolved and reports the survivor', async () => {
    flow.target = puree
    flow.preview = preview
    flow.canMerge = true
    const onMerged = render_()
    await userEvent.click(screen.getByRole('button', { name: strings.mergeConfirm }))
    expect(flow.merge).toHaveBeenCalled()
    await vi.waitFor(() => expect(onMerged).toHaveBeenCalledWith(9))
  })
  it('offers no Merge button when the Base Units differ', () => {
    flow.target = puree
    flow.preview = { ...preview, blocked: 'base_unit_mismatch', conflicts: [] }
    render_()
    expect(screen.getByText(strings.mergeBlocked)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: strings.mergeConfirm })).not.toBeInTheDocument()
  })
})
