// B9-37 (RX-02, RX-08): a compact Step card. The kind is one Segmented that never wraps ("Active", "Passive", "Advance", the last named
// "Advance Step"); Duration and Lead time are the shared DurationField (min, h, d; the draft keeps whole minutes); a Photo drop zone shows only
// after "Add Photo"; "Add ingredient use" and "Add Photo" are outline ChoiceChips ("Add Photo", "Add ingredient use"; the names repeat on every card, as "Remove Step" does, so tests scope to a card).
// Component-level; the same through the whole editor is in screens/RecipeEditorScreen.flow.test.tsx.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { PICKED_ID } from '../../../ui/ImagePicker/fake.test-helper'
import { CROP_ASPECTS } from '../../../ui/ImagePicker/lib/crop'
import { flour, garlic } from '../fixtures.test-helper'
import type { StepDraft } from '../lib/draft'

vi.mock('../../../ui', async (orig) => ({
  ...(await orig<object>()),
  ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker,
}))

import { StepsEditor } from './StepsEditor'

const step = (over: Partial<StepDraft> = {}): StepDraft => ({
  key: 'k1', text: 'Chop the onions', kind: 'active', durationMinutes: '10', leadTimeMinutes: '', after: [], uses: [], image: '', ...over,
})

/** Keeps the steps in state, so a change shows on the next render (and the last change is readable). */
function Harness({ initial, onSteps }: { initial: StepDraft[]; onSteps?: (s: StepDraft[]) => void }) {
  const [steps, setSteps] = useState(initial)
  return (
    <StepsEditor
      steps={steps}
      errors={{}}
      ingredients={[garlic, flour]}
      onChange={(next) => {
        setSteps(next)
        onSteps?.(next)
      }}
    />
  )
}
const card = (n: number) => screen.getAllByRole('listitem').filter((li) => li.matches('.step-card'))[n - 1]!

describe('the kind of a Step is one compact Segmented that never wraps', () => {
  it('Active, Passive and Advance; the third reads "Advance" but is named "Advance Step"', () => {
    render(<Harness initial={[step()]} />)
    const group = within(card(1)).getByRole('radiogroup', { name: 'Kind of Step 1' })
    expect(group).toHaveAttribute('data-compact', 'true')
    const radios = within(group).getAllByRole('radio')
    expect(radios.map((r) => r.textContent)).toEqual(['Active', 'Passive', 'Advance'])
    expect(within(group).getByRole('radio', { name: /^(Step \d+: )?Advance Step$/ })).toBe(radios[2])
    expect(radios[0]).toHaveAttribute('aria-checked', 'true')
  })

  it('choosing Advance Step switches the timing field from Duration to Lead time', async () => {
    render(<Harness initial={[step()]} />)
    expect(within(card(1)).getByRole('group', { name: /^Duration( of Step \d+)?$/ })).toBeInTheDocument()
    await userEvent.click(within(card(1)).getByRole('radio', { name: /^(Step \d+: )?Advance Step$/ }))
    expect(within(card(1)).queryByRole('group', { name: /^Duration( of Step \d+)?$/ })).toBeNull()
    expect(within(card(1)).getByRole('group', { name: /^Lead time( of Step \d+)?$/ })).toBeInTheDocument()
  })
})

describe('Duration and Lead time are DurationFields (RX-08)', () => {
  it('Duration: a number named "Duration" and a unit Select "Duration unit" offering min and h only', async () => {
    render(<Harness initial={[step({ durationMinutes: '90' })]} />)
    const group = within(card(1)).getByRole('group', { name: /^Duration( of Step \d+)?$/ })
    expect(within(group).getByRole('spinbutton', { name: /^Duration( of Step \d+)?$/ })).toHaveValue('90')
    const unit = within(group).getByRole('combobox', { name: /^Duration( of Step \d+)? unit$/ })
    expect(unit).toHaveTextContent('min')
    await userEvent.click(unit)
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['min', 'h'])
  })

  it('Lead time: min, h and d; 720 minutes reads "12 h", 1440 reads "1 d"', async () => {
    render(<Harness initial={[step({ kind: 'advance', durationMinutes: '', leadTimeMinutes: '720' }), step({ key: 'k2', kind: 'advance', durationMinutes: '', leadTimeMinutes: '1440' })]} />)
    const one = within(card(1)).getByRole('group', { name: /^Lead time( of Step \d+)?$/ })
    expect(within(one).getByRole('spinbutton', { name: /^Lead time( of Step \d+)?$/ })).toHaveValue('12')
    expect(within(one).getByRole('combobox', { name: /^Lead time( of Step \d+)? unit$/ })).toHaveTextContent('h')
    const two = within(card(2)).getByRole('group', { name: /^Lead time( of Step \d+)?$/ })
    expect(within(two).getByRole('spinbutton', { name: /^Lead time( of Step \d+)?$/ })).toHaveValue('1')
    expect(within(two).getByRole('combobox', { name: /^Lead time( of Step \d+)? unit$/ })).toHaveTextContent('d')
    await userEvent.click(within(one).getByRole('combobox', { name: /^Lead time( of Step \d+)? unit$/ }))
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['min', 'h', 'd'])
  })

  it('changing the unit converts what is shown and leaves the draft alone (still 720 minutes)', async () => {
    const onSteps = vi.fn()
    render(<Harness initial={[step({ kind: 'advance', durationMinutes: '', leadTimeMinutes: '720' })]} onSteps={onSteps} />)
    const group = within(card(1)).getByRole('group', { name: /^Lead time( of Step \d+)?$/ })
    await userEvent.click(within(group).getByRole('combobox', { name: /^Lead time( of Step \d+)? unit$/ }))
    await userEvent.click(screen.getByRole('option', { name: 'min' }))
    expect(within(group).getByRole('spinbutton', { name: /^Lead time( of Step \d+)?$/ })).toHaveValue('720')
    expect(onSteps).not.toHaveBeenCalled()
  })

  it('typing 1.5 in hours puts 90 minutes in the draft, as text', async () => {
    const onSteps = vi.fn()
    render(<Harness initial={[step({ durationMinutes: '120' })]} onSteps={onSteps} />)
    const number = within(card(1)).getByRole('spinbutton', { name: /^Duration( of Step \d+)?$/ })
    expect(number).toHaveValue('2') // 120 min is 2 h
    await userEvent.clear(number)
    await userEvent.type(number, '1.5')
    await userEvent.tab()
    expect(onSteps).toHaveBeenLastCalledWith([expect.objectContaining({ durationMinutes: '90' })])
  })

  it('an empty Lead time is an empty draft value, not "0"', async () => {
    const onSteps = vi.fn()
    render(<Harness initial={[step({ kind: 'advance', durationMinutes: '', leadTimeMinutes: '240' })]} onSteps={onSteps} />)
    const number = within(card(1)).getByRole('spinbutton', { name: /^Lead time( of Step \d+)?$/ })
    await userEvent.clear(number)
    await userEvent.tab()
    expect(onSteps).toHaveBeenLastCalledWith([expect.objectContaining({ leadTimeMinutes: '' })])
  })
})

describe('a Photo drop zone shows only after "Add Photo"', () => {
  it('a Step without a Photo draws no picker; "Add Photo" is an outline ChoiceChip', () => {
    const { container } = render(<Harness initial={[step()]} />)
    expect(screen.queryByRole('group', { name: 'Step photo' })).toBeNull()
    expect(container.querySelector('.file-drop, input[type=file]')).toBeNull()
    const add = within(card(1)).getByRole('button', { name: /^Add Photo( to Step \d+)?$/ })
    expect(add).toHaveClass('choice-chip')
    expect(add).toHaveAttribute('data-variant', 'outline')
    expect(add).toHaveTextContent('Photo')
  })

  it('five Steps draw no picker at all (the 10 drop zones of the old editor)', () => {
    render(<Harness initial={[1, 2, 3, 4, 5].map((n) => step({ key: `k${n}` }))} />)
    expect(screen.queryAllByTestId('fake-image-picker')).toHaveLength(0)
    expect(screen.getAllByRole('button', { name: /^Add Photo( to Step \d+)?$/ })).toHaveLength(5)
  })

  it('pressing it shows that Step\'s picker at 72 px (landscape), and the chip is gone', async () => {
    render(<Harness initial={[step(), step({ key: 'k2', text: 'Stir' })]} />)
    await userEvent.click(within(card(2)).getByRole('button', { name: /^Add Photo( to Step \d+)?$/ }))
    const picker = within(card(2)).getByRole('group', { name: 'Step photo' })
    expect(picker).toHaveAttribute('data-size', '72')
    expect(picker).toHaveAttribute('data-aspect', String(CROP_ASPECTS.landscape))
    expect(within(card(2)).queryByRole('button', { name: /^Add Photo( to Step \d+)?$/ })).toBeNull()
    expect(within(card(1)).queryByRole('group', { name: 'Step photo' })).toBeNull()
  })

  it('a Step that has a Photo shows its picker at once, with no "Add Photo" chip', () => {
    render(<Harness initial={[step({ image: 'abc' })]} />)
    const picker = within(card(1)).getByRole('group', { name: 'Step photo' })
    expect(picker).toHaveAttribute('data-value', 'abc')
    expect(within(card(1)).queryByRole('button', { name: /^Add Photo/ })).toBeNull()
  })

  it('picking sets the Step\'s image; the picker stays', async () => {
    const onSteps = vi.fn()
    render(<Harness initial={[step()]} onSteps={onSteps} />)
    await userEvent.click(within(card(1)).getByRole('button', { name: /^Add Photo( to Step \d+)?$/ }))
    await userEvent.click(within(card(1)).getByRole('button', { name: 'pick Step photo' }))
    expect(onSteps).toHaveBeenLastCalledWith([expect.objectContaining({ image: PICKED_ID })])
    expect(within(card(1)).getByRole('group', { name: 'Step photo' })).toBeInTheDocument()
  })
})

describe('Ingredient uses are added with an outline ChoiceChip', () => {
  it('"Add ingredient use" sits beside "Add Photo" in one chip row, and adds a use', async () => {
    const onSteps = vi.fn()
    render(<Harness initial={[step()]} onSteps={onSteps} />)
    const add = within(card(1)).getByRole('button', { name: /^Add ingredient use( to Step \d+)?$/ })
    expect(add).toHaveClass('choice-chip')
    expect(add).toHaveAttribute('data-variant', 'outline')
    expect(add).toHaveTextContent('Ingredient use')
    expect(add.parentElement).toBe(within(card(1)).getByRole('button', { name: /^Add Photo( to Step \d+)?$/ }).parentElement)
    await userEvent.click(add)
    expect(onSteps).toHaveBeenLastCalledWith([expect.objectContaining({ uses: [expect.objectContaining({ ingredientId: null })] })])
  })
})

describe('the rest of the card is as before', () => {
  it('"After" chips show only when there are earlier Steps', () => {
    render(<Harness initial={[step(), step({ key: 'k2', text: 'Stir' })]} />)
    expect(within(card(1)).queryByRole('group', { name: 'After' })).toBeNull()
    expect(within(card(2)).getByRole('group', { name: 'After' })).toBeInTheDocument()
  })

  it('each card has its number, a drag handle, a ⋮ "Step actions" and a Remove Step button', () => {
    render(<Harness initial={[step()]} />)
    expect(card(1).querySelector('[data-step-number]')).toHaveTextContent('1')
    expect(within(card(1)).getByRole('button', { name: /Step actions|Actions for Step 1|Step 1 actions/ })).toBeInTheDocument()
    expect(within(card(1)).getByRole('button', { name: /Remove Step/ })).toBeInTheDocument()
  })
})
