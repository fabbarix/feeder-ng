// R2-1 (E-02, E-03): a Step card is number · text · actions, then one FieldRow of Kind and Duration (xs, "min"), then the Uses chips.
// The photo of a Step belongs to IM2 (ImagePicker) and is not tested here.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { flour, garlic } from '../fixtures.test-helper'
import type { StepDraft } from '../lib/draft'
import { StepsEditor, type StepsEditorProps } from './StepsEditor'

const step = (over: Partial<StepDraft> = {}): StepDraft => ({
  key: 'k', text: 'Chop', kind: 'active', durationMinutes: '5', leadTimeMinutes: '', after: [], uses: [], image: '', ...over,
})
const view = (steps: StepDraft[], over: Partial<StepsEditorProps> = {}) => {
  const p: StepsEditorProps = { steps, errors: {}, onChange: vi.fn(), ingredients: [garlic, flour], ...over }
  const out = render(<StepsEditor {...p} />)
  return { p, ...out }
}
const card = (i = 0) => screen.getAllByRole('listitem').filter((li) => li.matches('ol > li'))[i]!

describe('StepsEditor: card layout', () => {
  it('Kind and Duration share one FieldRow; Duration is xs with a "min" suffix', () => {
    view([step()])
    const kind = within(card()).getByRole('radiogroup', { name: 'Kind' })
    const duration = within(card()).getByRole('spinbutton', { name: 'Duration (min)' })
    const row = kind.closest('.field-row')
    expect(row).not.toBeNull()
    expect(row).toContainElement(duration)
    expect(row).toHaveClass('step-card__timing')
    const frame = duration.closest('.ui-field')!
    expect(frame).toHaveAttribute('data-size', 'xs')
    expect(frame.querySelector('.ui-field__suffix')).toHaveTextContent('min')
  })
  it('an Advance Step shows Lead time in the same place, xs with "min"', () => {
    view([step({ kind: 'advance', leadTimeMinutes: '240', durationMinutes: '' })])
    const lead = within(card()).getByRole('spinbutton', { name: 'Lead time (min)' })
    expect(lead.closest('.field-row')).toHaveClass('step-card__timing')
    expect(lead.closest('.ui-field')!.querySelector('.ui-field__suffix')).toHaveTextContent('min')
  })
  it('the Step text is a TextArea in the card', () => {
    view([step({ text: 'Dice the onion' })])
    expect(within(card()).getByRole('textbox', { name: 'Step text' })).toHaveValue('Dice the onion')
  })
})

describe('StepsEditor: Step actions', () => {
  it('Remove Step stays a visible IconButton; reordering lives in the "Step actions" menu', async () => {
    view([step({ key: 'a' }), step({ key: 'b' })])
    expect(within(card()).getByRole('button', { name: 'Remove Step' })).toBeInTheDocument()
    expect(within(card()).queryByRole('button', { name: 'Move Step up' })).toBeNull()
    const more = within(card()).getByRole('button', { name: 'Step actions' })
    expect(more).toHaveAttribute('aria-haspopup', 'menu')
    await userEvent.click(more)
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Move Step up', 'Move Step down'])
  })
})

describe('StepsEditor: Uses as chips', () => {
  it('shows no empty "Uses" label; a "+" chip adds a use', async () => {
    const { p } = view([step()])
    expect(within(card()).queryByText('Uses')).toBeNull()
    const add = within(card()).getByRole('button', { name: 'Add ingredient use' })
    expect(add).toHaveClass('chip')
    await userEvent.click(add)
    expect(vi.mocked(p.onChange).mock.calls[0]![0][0]!.uses).toHaveLength(1)
  })
  it('with uses, the label "Uses" shows above the rows and the add chip stays', () => {
    view([step({ uses: [{ key: 'u1', ingredientId: 7, ingredientName: 'garlic', quantity: '2', unit: 'clove' }] })])
    expect(within(card()).getByText('Uses')).toBeInTheDocument()
    expect(within(card()).getByRole('button', { name: 'Add ingredient use' })).toHaveClass('chip')
  })
  it('"After step" chips stay', () => {
    view([step({ key: 'a' }), step({ key: 'b' })])
    expect(within(card(1)).getByRole('button', { name: 'After step 1' })).toHaveClass('chip')
  })
})
