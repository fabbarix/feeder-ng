// SR5 (13.5 step 1): "Which Line is it?": the open Shopping List Lines as chips, Restock Lines of Supplies included, and Something else.
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { LineCandidate } from '../lib/lineChoice'
import { addButton, basilLine, dialog, dishSoapLine, lineGroup, lines, mozzarellaLine, packGroup, setup, tickedPastaLine } from './newProduct.test-helper'

const chipNames = () => within(lineGroup()).getAllByRole('button').map((b) => b.textContent ?? '')

describe('NewProductSheet: Which Line is it?', () => {
  it('opens as "What is this?" on the Line chips, with the barcode and no form fields yet', () => {
    setup({ lines })
    expect(dialog()).toBeInTheDocument()
    expect(within(dialog()).getByText('8001234567890 · not in Feeder yet')).toBeInTheDocument()
    expect(within(dialog()).queryByRole('radiogroup', { name: 'What it is' })).toBeNull()
    expect(within(dialog()).queryByRole('combobox')).toBeNull()
  })

  it('shows the unticked Lines in list order, food first and Restock Lines after, then Something else', () => {
    setup({ lines })
    const names = chipNames()
    expect(names).toHaveLength(6)
    expect(names[0]).toMatch(/^Mozzarella/)
    expect(names[1]).toMatch(/^Fresh basil/)
    expect(names[2]).toMatch(/^Lemons/)
    expect(names[3]).toMatch(/^Eggs/)
    expect(names[4]).toMatch(/^Dish soap.*Restock/)
    expect(names[5]).toBe('Something else')
  })

  it('leaves out a ticked Line and a Line that nothing is needed for', () => {
    setup({ lines: [tickedPastaLine, { ...mozzarellaLine, ingredientId: 40, name: 'Covered', quantity: 0 }, basilLine] })
    expect(chipNames().filter((n) => /Pasta|Covered/.test(n))).toEqual([])
  })

  it('each chip says the amount still to get; a Restock Line says Restock', () => {
    setup({ lines })
    const names = chipNames()
    expect(names[0]).toBe('Mozzarella 125 g')
    expect(names[3]).toBe('Eggs 6 pieces')
    expect(names[4]).toBe('Dish soap Restock')
  })

  it('a partly covered Line is still there', () => {
    setup({ lines: [{ ...mozzarellaLine, quantity: 40 }] })
    expect(chipNames()[0]).toMatch(/^Mozzarella/)
  })

  it('shows at most 8 chips, and "More Lines" reveals the rest', async () => {
    const many: LineCandidate[] = Array.from({ length: 10 }, (_, i) => ({ ingredientId: 100 + i, name: `Line ${i + 1}`, baseUnit: 'g', quantity: 100, ticked: false }))
    setup({ lines: many })
    expect(chipNames().filter((n) => /^Line /.test(n))).toHaveLength(8)
    await userEvent.click(within(lineGroup()).getByRole('button', { name: 'More Lines' }))
    expect(chipNames().filter((n) => /^Line /.test(n))).toHaveLength(10)
  })

  it('has no "More Lines" while all the Lines fit', () => {
    setup({ lines })
    expect(within(lineGroup()).queryByRole('button', { name: 'More Lines' })).toBeNull()
  })

  it('says what picking a Line does', () => {
    setup({ lines })
    expect(within(lineGroup()).getByText(/Picking a Line sets what it is and ticks it/)).toBeInTheDocument()
  })

  it.each([
    ['no Lines', undefined],
    ['an empty list', []],
    ['only ticked Lines', [tickedPastaLine]],
  ] as const)('skips the step with %s and starts on the Ingredient | Supply form', (_name, given) => {
    setup({ lines: given as LineCandidate[] | undefined })
    expect(within(dialog()).queryByRole('group', { name: 'Which Line is it?' })).toBeNull()
    expect(within(dialog()).getByRole('radiogroup', { name: 'What it is' })).toBeInTheDocument()
  })

  it('picking a Line takes its Ingredient, shows its pack chips and the ticking Add', async () => {
    setup({ lines })
    await userEvent.click(within(lineGroup()).getByRole('button', { name: /^Mozzarella/ }))
    expect(within(dialog()).queryByRole('group', { name: 'Which Line is it?' })).toBeNull()
    expect(within(dialog()).queryByRole('radiogroup', { name: 'What it is' })).toBeNull()
    expect(within(dialog()).getByText('Mozzarella · Ingredient')).toBeInTheDocument()
    expect(packGroup()).toBeInTheDocument()
    expect(addButton('Add · ticks Mozzarella')).toBeInTheDocument()
  })

  it('picking a Restock Line takes the Supply and its Base Unit', async () => {
    setup({ lines })
    await userEvent.click(within(lineGroup()).getByRole('button', { name: new RegExp(dishSoapLine.name) }))
    expect(within(dialog()).getByText('Dish soap · Supply')).toBeInTheDocument()
    expect(within(packGroup()).getByRole('button', { name: '500 ml' })).toBeInTheDocument()
    expect(addButton('Add · ticks Dish soap')).toBeInTheDocument()
  })

  it('"Pick another Line" goes back to the chips and Add stops ticking', async () => {
    setup({ lines })
    await userEvent.click(within(lineGroup()).getByRole('button', { name: /^Mozzarella/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Pick another Line' }))
    expect(lineGroup()).toBeInTheDocument()
    await userEvent.click(within(lineGroup()).getByRole('button', { name: 'Something else' }))
    expect(addButton('Add')).toBeInTheDocument()
  })

  it('a weighed code also starts on the Lines, and after picking one asks for no pack size', async () => {
    setup({ lines, mode: 'weighed' })
    await userEvent.click(within(lineGroup()).getByRole('button', { name: /^Mozzarella/ }))
    expect(within(dialog()).queryByRole('group', { name: 'Pack size' })).toBeNull()
    expect(addButton('Add · ticks Mozzarella')).toBeInTheDocument()
  })

  it('the Line chips are real buttons (no native select, radio or checkbox anywhere)', () => {
    setup({ lines })
    expect(document.querySelector('select, input[type=radio], input[type=checkbox]')).toBeNull()
    for (const b of within(lineGroup()).getAllByRole('button')) expect(b.tagName).toBe('BUTTON')
  })
})
