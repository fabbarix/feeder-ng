// B9-31 (SAFE-10): how StepsEditor reports a removal. The Steps editor does not show the Undo toast itself (it renders inside no
// provider in the older tests); the screen does, through the callbacks below. Optional props on StepsEditorProps:
//   onRemoveStep?(index): void            the Remove Step button calls it INSTEAD of onChange(removeStep(...)) when given
//   onRemoveUse?(stepIndex, useIndex): void   the same for Remove ingredient use
// Without them the editor keeps its old behaviour (onChange with the shortened Steps), so the older tests stand.
// Each Step card is a focus row for A11Y-07: data-focus-key = the Step's key (useFocusKeeper), so focus falling with a removed card
// goes to its successor; its "Step actions" is the card's first control after the drag handle.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { flour, garlic } from '../fixtures.test-helper'
import type { StepDraft } from '../lib/draft'
import { StepsEditor, type StepsEditorProps } from './StepsEditor'

vi.mock('../../../ui', async (orig) => ({ ...(await orig<object>()), ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker }))

const step = (over: Partial<StepDraft> = {}): StepDraft => ({ key: 'k', text: 'Chop', kind: 'active', durationMinutes: '5', leadTimeMinutes: '', after: [], uses: [], image: '', ...over })
const use = { key: 'u1', ingredientId: 7, ingredientName: 'garlic', quantity: '2', unit: 'clove' }
const view = (steps: StepDraft[], over: Partial<StepsEditorProps> = {}) => {
  const p: StepsEditorProps = { steps, errors: {}, onChange: vi.fn(), ingredients: [garlic, flour], ...over }
  render(<StepsEditor {...p} />)
  return p
}
const cards = () => screen.getAllByRole('listitem').filter((li) => li.matches('ol > li'))

describe('StepsEditor: removal callbacks', () => {
  it('Remove Step calls onRemoveStep with the index and does not change the Steps itself', async () => {
    const onRemoveStep = vi.fn()
    const p = view([step({ key: 'a' }), step({ key: 'b' })], { onRemoveStep })
    await userEvent.click(within(cards()[1]!).getByRole('button', { name: 'Remove Step' }))
    expect(onRemoveStep).toHaveBeenCalledWith(1)
    expect(p.onChange).not.toHaveBeenCalled()
  })

  it('Remove ingredient use calls onRemoveUse with the Step and use indexes', async () => {
    const onRemoveUse = vi.fn()
    const p = view([step({ key: 'a' }), step({ key: 'b', uses: [use, { ...use, key: 'u2' }] })], { onRemoveUse })
    await userEvent.click(within(cards()[1]!).getAllByRole('button', { name: 'Remove ingredient use' })[1]!)
    expect(onRemoveUse).toHaveBeenCalledWith(1, 1)
    expect(p.onChange).not.toHaveBeenCalled()
  })

  it('without the callbacks the old behaviour stands (onChange with the shortened Steps)', async () => {
    const p = view([step({ key: 'a' }), step({ key: 'b' })])
    await userEvent.click(within(cards()[0]!).getByRole('button', { name: 'Remove Step' }))
    expect(vi.mocked(p.onChange).mock.calls[0]![0].map((s) => s.key)).toEqual(['b'])
  })

  it('each Step card is a focus row keyed by the Step', () => {
    view([step({ key: 'a' }), step({ key: 'b' })])
    expect(cards().map((c) => c.getAttribute('data-focus-key'))).toEqual(['a', 'b'])
  })

  it('"Add Step" stays reachable when there are no Steps', () => {
    view([])
    expect(screen.getByRole('button', { name: 'Add Step' })).toBeInTheDocument()
  })
})
