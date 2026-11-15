// R2-1 (E-02, E-03), rewritten for B9-37 (RX-02, RX-08): a Step card is a lead column (number, handle), a body (text; one timing row of
// the compact kind Segmented and a DurationField; the chip row of uses, "Ingredient use" and "Photo") and its actions (⋮ and Remove Step).
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
  it('Kind and Duration share one timing row; Duration is a DurationField in minutes', () => {
    view([step()])
    const kind = within(card()).getByRole('radiogroup', { name: 'Kind of Step 1' })
    const duration = within(card()).getByRole('group', { name: /^Duration( of Step \d+)?$/ })
    const row = kind.closest('.step-card__timing')
    expect(row).not.toBeNull()
    expect(row).toContainElement(duration)
    expect(within(duration).getByRole('spinbutton', { name: /^Duration( of Step \d+)?$/ })).toHaveValue('5')
    expect(within(duration).getByRole('combobox', { name: /^Duration( of Step \d+)? unit$/ })).toHaveTextContent('min')
  })
  it('an Advance Step shows Lead time in the same place', () => {
    view([step({ kind: 'advance', leadTimeMinutes: '240', durationMinutes: '' })])
    const lead = within(card()).getByRole('group', { name: /^Lead time( of Step \d+)?$/ })
    expect(lead.closest('.step-card__timing')).not.toBeNull()
  })
  it('the Kind Segmented is compact (each option as wide as its label, never wrapping): Active, Passive, Advance', () => {
    view([step()])
    const kind = within(card()).getByRole('radiogroup', { name: 'Kind of Step 1' })
    expect(kind).toHaveAttribute('data-compact')
    expect(within(kind).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Active', 'Passive', 'Advance'])
  })
  it('the Step text is a TextArea in the card body; the number and handle are in the lead column', () => {
    view([step({ text: 'Dice the onion' })])
    expect(card().querySelector('.step-card__body')).toContainElement(within(card()).getByRole('textbox', { name: 'Step text' }))
    expect(card().querySelector('.step-card__lead [data-step-number]')).toHaveTextContent('1')
  })
})

describe('StepsEditor: Step actions', () => {
  it('Remove Step is an IconButton in the actions; the "Step actions" menu holds Move up, Move down and Remove Step', async () => {
    view([step({ key: 'a' }), step({ key: 'b' })])
    const actions = card().querySelector('.step-card__actions') as HTMLElement
    expect(within(actions).getByRole('button', { name: /^Remove Step( \d+)?$/ })).toBeInTheDocument()
    expect(within(card()).queryByRole('button', { name: 'Move Step up' })).toBeNull()
    const more = within(actions).getByRole('button', { name: /^Step( \d+)? actions$/ })
    expect(more).toHaveAttribute('aria-haspopup', 'menu')
    await userEvent.click(more)
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Move Step up', 'Move Step down', 'Remove Step'])
  })
})

describe('StepsEditor: Uses as chips', () => {
  it('shows no "Uses" label; the "Ingredient use" ChoiceChip adds a use', async () => {
    const { p } = view([step()])
    expect(within(card()).queryByText('Uses')).toBeNull()
    const add = within(card()).getByRole('button', { name: /^Add ingredient use( to Step \d+)?$/ })
    expect(add).toHaveClass('choice-chip')
    await userEvent.click(add)
    expect(vi.mocked(p.onChange).mock.calls[0]![0][0]!.uses).toHaveLength(1)
  })
  it('with uses, each use is a chip before the add chip, which stays', () => {
    view([step({ uses: [{ key: 'u1', ingredientId: 7, ingredientName: 'garlic', quantity: '2', unit: 'clove' }] })])
    const use = within(card()).getByRole('button', { name: /^2 clove Garlic( in Step \d+)?$/ })
    const add = within(card()).getByRole('button', { name: /^Add ingredient use( to Step \d+)?$/ })
    expect(use.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(add).toHaveClass('choice-chip')
  })
  it('"After step" chips stay', () => {
    view([step({ key: 'a' }), step({ key: 'b' })])
    expect(within(card(1)).getByRole('button', { name: /^(Step \d+ after Step|After step) 1$/ })).toHaveClass('chip')
  })
})
