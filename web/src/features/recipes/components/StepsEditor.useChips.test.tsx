// B9-37 (RX-02; main-session ruling 3, written by the developer before the code because the test author left it unpinned): a Step's
// Ingredient uses are chips. Each use is a chip "2 clove Garlic" that is a real button, with its own remove × beside it inside the chip
// (two buttons, never fused). Pressing the chip opens that use's fields (Ingredient used, Quantity used, Unit used) in one row under the
// chips; one use is open at a time; Enter, Escape or its chip closes it (w4b: leaving the row no longer does, it moved the layout). "Add ingredient use" adds a use and opens its picker; after a
// pick the cursor is in "Quantity used". A use with an error stays open, so its fields can be found. Removing keeps B9-31's callback.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { flour, garlic } from '../fixtures.test-helper'
import type { DraftErrors, StepDraft, UseDraft } from '../lib/draft'

vi.mock('../../../ui', async (orig) => ({ ...(await orig<object>()), ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker }))

import { StepsEditor } from './StepsEditor'

const use = (over: Partial<UseDraft> = {}): UseDraft => ({ key: 'u1', ingredientId: 7, ingredientName: '', quantity: '2', unit: 'clove', ...over })
const step = (over: Partial<StepDraft> = {}): StepDraft => ({ key: 'k1', text: 'Fry', kind: 'active', durationMinutes: '5', leadTimeMinutes: '', after: [], uses: [], image: '', ...over })

function Harness({ initial, errors = {}, onSteps, onRemoveUse }: { initial: StepDraft[]; errors?: DraftErrors; onSteps?: (s: StepDraft[]) => void; onRemoveUse?: (i: number, j: number) => void }) {
  const [steps, setSteps] = useState(initial)
  return (
    <>
      <StepsEditor
        steps={steps}
        errors={errors}
        ingredients={[garlic, flour]}
        onRemoveUse={onRemoveUse}
        onChange={(next) => {
          setSteps(next)
          onSteps?.(next)
        }}
      />
      <button type="button">elsewhere</button>
    </>
  )
}
const card = (n: number) => screen.getAllByRole('listitem').filter((li) => li.matches('.step-card'))[n - 1]!

describe('a use is a chip with its own remove', () => {
  it('shows "2 clove Garlic" as a button (closed) and a "Remove ingredient use" button; no use fields until it is pressed', () => {
    render(<Harness initial={[step({ uses: [use()] })]} />)
    const chip = within(card(1)).getByRole('button', { name: /^2 clove Garlic( in Step \d+)?$/ })
    expect(chip).toHaveAttribute('aria-expanded', 'false')
    expect(chip.closest('[data-use]')).not.toBeNull()
    const remove = within(card(1)).getByRole('button', { name: /^Remove (ingredient use|.+ from Step \d+)$/ })
    expect(remove.closest('[data-use]')).toBe(chip.closest('[data-use]'))
    expect(remove).not.toBe(chip)
    expect(within(card(1)).queryByRole('textbox', { name: 'Quantity used' })).toBeNull()
  })

  it('the × removes through onRemoveUse (B9-31\'s Undo), with the Step and use indexes', async () => {
    const onRemoveUse = vi.fn()
    render(<Harness initial={[step(), step({ key: 'k2', uses: [use(), use({ key: 'u2', ingredientId: 8, quantity: '100', unit: 'g' })] })]} onRemoveUse={onRemoveUse} />)
    await userEvent.click(within(card(2)).getAllByRole('button', { name: /^Remove (ingredient use|.+ from Step \d+)$/ })[1]!)
    expect(onRemoveUse).toHaveBeenCalledWith(1, 1)
  })
})

describe('pressing a use chip opens its fields under the chips', () => {
  it('opens Ingredient used, Quantity used and Unit used in one row, and says it is open', async () => {
    render(<Harness initial={[step({ uses: [use()] })]} />)
    await userEvent.click(within(card(1)).getByRole('button', { name: /^2 clove Garlic( in Step \d+)?$/ }))
    expect(within(card(1)).getByRole('button', { name: /^2 clove Garlic( in Step \d+)?$/ })).toHaveAttribute('aria-expanded', 'true')
    const row = within(card(1)).getByRole('textbox', { name: 'Quantity used' }).closest('.use-row')!
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByRole('combobox', { name: /^Unit used( in Step \d+)?$/ })).toHaveTextContent('clove')
    expect(within(row as HTMLElement).getByRole('combobox', { name: /^Ingredient used( in Step \d+)?$/ })).toHaveTextContent('garlic')
    expect(within(card(1)).getByRole('textbox', { name: 'Quantity used' })).toHaveValue('2')
  })

  it('one use is open at a time', async () => {
    render(<Harness initial={[step({ uses: [use(), use({ key: 'u2', ingredientId: 8, quantity: '100', unit: 'g' })] })]} />)
    await userEvent.click(within(card(1)).getByRole('button', { name: /^2 clove Garlic( in Step \d+)?$/ }))
    await userEvent.click(within(card(1)).getByRole('button', { name: /^100 g Flour( in Step \d+)?$/ }))
    expect(within(card(1)).getAllByRole('textbox', { name: 'Quantity used' })).toHaveLength(1)
    expect(within(card(1)).getByRole('textbox', { name: 'Quantity used' })).toHaveValue('100')
    expect(within(card(1)).getByRole('button', { name: /^2 clove Garlic( in Step \d+)?$/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('typing changes the use; Enter closes the row and gives the chip the focus back', async () => {
    const onSteps = vi.fn()
    render(<Harness initial={[step({ uses: [use()] })]} onSteps={onSteps} />)
    await userEvent.click(within(card(1)).getByRole('button', { name: /^2 clove Garlic( in Step \d+)?$/ }))
    const qty = within(card(1)).getByRole('textbox', { name: 'Quantity used' })
    await userEvent.clear(qty)
    await userEvent.type(qty, '3{Enter}')
    expect(onSteps).toHaveBeenLastCalledWith([expect.objectContaining({ uses: [expect.objectContaining({ quantity: '3' })] })])
    expect(within(card(1)).queryByRole('textbox', { name: 'Quantity used' })).toBeNull()
    expect(within(card(1)).getByRole('button', { name: /^3 clove Garlic( in Step \d+)?$/ })).toHaveFocus()
  })

  it('Escape in a field closes the row and gives the chip the focus back (w4b review)', async () => {
    render(<Harness initial={[step({ uses: [use()] })]} />)
    await userEvent.click(within(card(1)).getByRole('button', { name: /^2 clove Garlic( in Step \d+)?$/ }))
    await userEvent.click(within(card(1)).getByRole('textbox', { name: 'Quantity used' }))
    await userEvent.keyboard('{Escape}')
    expect(within(card(1)).queryByRole('textbox', { name: 'Quantity used' })).toBeNull()
    expect(within(card(1)).getByRole('button', { name: /^2 clove Garlic( in Step \d+)?$/ })).toHaveFocus()
  })

  it('the open row comes right after the chip row, before a Photo, so the chip and its fields stay together (w4b review)', async () => {
    render(<Harness initial={[step({ uses: [use()], image: 'img1' })]} />)
    await userEvent.click(within(card(1)).getByRole('button', { name: /^2 clove Garlic( in Step \d+)?$/ }))
    const row = card(1).querySelector('.use-row')!
    expect(row.parentElement).toBe(card(1).querySelector('.step-card__extras'))
    expect(row.previousElementSibling?.matches('.step-card__photo, .step-card__more')).toBe(true)
  })

  it('leaving the row keeps it open, so nothing under it moves while the cursor goes on; pressing its chip closes it (w4b review)', async () => {
    render(<Harness initial={[step({ uses: [use()] })]} />)
    const chip = within(card(1)).getByRole('button', { name: /^2 clove Garlic( in Step \d+)?$/ })
    await userEvent.click(chip)
    await userEvent.click(within(card(1)).getByRole('textbox', { name: 'Quantity used' }))
    await userEvent.click(screen.getByRole('button', { name: 'elsewhere' }))
    expect(within(card(1)).getByRole('textbox', { name: 'Quantity used' })).toBeInTheDocument()
    await userEvent.click(chip)
    expect(within(card(1)).queryByRole('textbox', { name: 'Quantity used' })).toBeNull()
  })
})

describe('"Add ingredient use" adds a use and opens its picker', () => {
  it('the new use is open and its Ingredient picker has the cursor', async () => {
    const onSteps = vi.fn()
    render(<Harness initial={[step()]} onSteps={onSteps} />)
    await userEvent.click(within(card(1)).getByRole('button', { name: /^Add ingredient use( to Step \d+)?$/ }))
    expect(onSteps).toHaveBeenLastCalledWith([expect.objectContaining({ uses: [expect.objectContaining({ ingredientId: null })] })])
    expect(within(card(1)).getByRole('combobox', { name: /^Ingredient used( in Step \d+)?$/ })).toHaveFocus()
  })

  it('after a pick the cursor is in "Quantity used"', async () => {
    render(<Harness initial={[step()]} />)
    await userEvent.click(within(card(1)).getByRole('button', { name: /^Add ingredient use( to Step \d+)?$/ }))
    await userEvent.click(within(card(1)).getByRole('combobox', { name: /^Ingredient used( in Step \d+)?$/ }))
    await userEvent.click(screen.getByRole('option', { name: /flour/ }))
    expect(within(card(1)).getByRole('textbox', { name: 'Quantity used' })).toHaveFocus()
  })
})

describe('a use with an error', () => {
  it('stays open, so its field shows the error and can take focus', () => {
    render(<Harness initial={[step({ uses: [use({ quantity: '' })] })]} errors={{ 'steps.0.uses.0.quantity': 'quantity_invalid' }} />)
    expect(within(card(1)).getByRole('textbox', { name: 'Quantity used' })).toHaveAttribute('aria-invalid', 'true')
  })
})
