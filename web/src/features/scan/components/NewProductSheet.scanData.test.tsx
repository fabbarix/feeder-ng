// B9-41: the new-Product sheet's data: SSP-07 the header of a weighed code (weight, Shop, item code) and the Lines in g first, SSP-20 the
// code as printed, SSP-15 the "weighed goods" hint for an in-store code at a Shop with no Weight Barcode Rule, A11Y-07 focus after a step
// change. (The ordinary behaviour of the sheet is in the other NewProductSheet.*.test.tsx files.)
import { render, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Icon } from '../../../ui/Icon'
import type { LineCandidate } from '../lib/lineChoice'
import { addButton, choose, dialog, lemonsLine, lineGroup, mozzarellaLine, packGroup, setup } from './newProduct.test-helper'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
// vitest blanks CSS imports, so the file is read from disk
const css = readFileSync(`${cwd}/src/features/scan/components/NewProductSheet.css`, 'utf8')
const chipNames = () => within(lineGroup()).getAllByRole('button').map((b) => b.textContent ?? '')
const iconMarkup = (name: 'weigh' | 'typeBarcode') => {
  const { container, unmount } = render(<Icon name={name} size={16} />)
  const html = container.querySelector('svg')!.innerHTML
  unmount()
  return html
}

describe('NewProductSheet: a weighed code (SSP-07)', () => {
  const weighed = { mode: 'weighed' as const, barcode: undefined, weighed: { grams: 312, itemCode: '012300' }, lines: [lemonsLine, mozzarellaLine] }

  it('the header line reads "312 g · weighed at Coop · item 012300" with the Scales icon, and there is no barcode line', () => {
    setup(weighed)
    const header = within(dialog()).getByText('312 g · weighed at Coop · item 012300')
    expect(header.closest('p, div')!.querySelector('svg')!.innerHTML).toBe(iconMarkup('weigh'))
    expect(within(dialog()).queryByText(/not in Feeder yet/)).toBeNull()
  })

  it('the weight is said as Feeder says amounts: 1250 g is "1.25 kg"', () => {
    setup({ ...weighed, weighed: { grams: 1250, itemCode: '000042' } })
    expect(within(dialog()).getByText('1.25 kg · weighed at Coop · item 000042')).toBeInTheDocument()
  })

  it('the header line is the sheet\'s description', () => {
    setup(weighed)
    expect(dialog()).toHaveAccessibleDescription(expect.stringContaining('312 g · weighed at Coop · item 012300'))
  })

  it('the Lines in g come first (Lemons is on pieces, though it comes first in the list), and the hint says so', () => {
    setup(weighed)
    expect(chipNames().slice(0, 2)).toEqual(['Mozzarella 125 g', 'Lemons 4 pieces'])
    expect(within(dialog()).getByText('Lines in grams are listed first.')).toBeInTheDocument()
    expect(within(dialog()).queryByText(/Lines you still need are listed first/)).toBeNull()
  })

  it('a pack code keeps its barcode line, its Line order and its hint', () => {
    setup({ lines: [lemonsLine, mozzarellaLine] })
    expect(chipNames().slice(0, 2)).toEqual(['Lemons 4 pieces', 'Mozzarella 125 g'])
    expect(within(dialog()).getByText(/Lines you still need are listed first/)).toBeInTheDocument()
    expect(within(dialog()).queryByText(/weighed at/)).toBeNull()
  })
})

describe('NewProductSheet: the code as printed (SSP-20)', () => {
  it('shows an EAN-13 in 1-6-6 groups, not the 14 digits nobody typed, with the digits alone as its accessible name', () => {
    setup({ barcode: '08000000009999' })
    const code = within(dialog()).getByText('8 000000 009999')
    expect(code).toHaveAttribute('aria-label', '8000000009999')
    expect(code.closest('p')).toHaveTextContent('8 000000 009999 · not in Feeder yet')
    expect(within(dialog()).queryByText(/08000000009999/)).toBeNull()
  })

  it('a UPC-A is 1-5-5-1 and an EAN-8 is 4-4; a code of another kind is as it came', () => {
    const a = setup({ barcode: '00036000291452' })
    expect(within(dialog()).getByText('0 36000 29145 2')).toBeInTheDocument()
    a.unmount()
    const b = setup({ barcode: '00000096385074' })
    expect(within(dialog()).getByText('9638 5074')).toBeInTheDocument()
    b.unmount()
    setup({ barcode: 'ABC-123' })
    expect(within(dialog()).getByText('ABC-123')).toBeInTheDocument()
  })

  it('the figures are tabular', () => {
    expect(css).toMatch(/new-product__(code|barcode)[^{]*\{[^}]*tabular-nums/s)
  })
})

describe('NewProductSheet: a weight-style code at a Shop with no Weight Barcode Rule (SSP-15)', () => {
  const hint = (admin: boolean) => ({ admin, onSetUp: vi.fn() })
  const tile = () => within(dialog()).getByText('This looks like a Coop code for weighed goods').closest('[data-status]') as HTMLElement

  it('opens with an info tile that says so, above the form, and the form continues below it', () => {
    setup({ barcode: '02100123012503', weightCodeHint: hint(true), lines: [mozzarellaLine] })
    expect(tile()).toHaveAttribute('data-status', 'info')
    expect(within(tile()).getByText('Coop has no Weight Barcode Rule, so every weighed pack would become a Product of its own.')).toBeInTheDocument()
    expect(within(dialog()).getByRole('group', { name: 'Which Line is it?' })).toBeInTheDocument()
    expect(tile().compareDocumentPosition(lineGroup()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('an Admin sees "Set up the rule", an outlined button that goes to the rules', async () => {
    const weightCodeHint = hint(true)
    setup({ barcode: '02100123012503', weightCodeHint })
    const button = within(tile()).getByRole('button', { name: 'Set up the rule' })
    expect(button).toHaveAttribute('data-variant', 'secondary')
    await userEvent.click(button)
    expect(weightCodeHint.onSetUp).toHaveBeenCalledOnce()
    expect(within(tile()).queryByText('Ask the Admin to set one up.')).toBeNull()
  })

  it('a User sees "Ask the Admin to set one up." and no button', () => {
    setup({ barcode: '02100123012503', weightCodeHint: hint(false) })
    expect(within(tile()).getByText('Ask the Admin to set one up.')).toBeInTheDocument()
    expect(within(tile()).queryByRole('button')).toBeNull()
  })

  it('the tile is the sheet\'s first description', () => {
    setup({ barcode: '02100123012503', weightCodeHint: hint(false) })
    expect(dialog()).toHaveAccessibleDescription(/^This looks like a Coop code for weighed goods/)
  })

  it('the scope starts on This Shop only: the summary says "Coop only" and Add saves a Shop Barcode', async () => {
    const { props } = setup({ barcode: '02100123012503', weightCodeHint: hint(true) })
    await choose(/Ingredient/, /^milk/)
    await userEvent.click(within(packGroup()).getByRole('button', { name: '1 l' }))
    expect(within(dialog()).getByText(/Coop only/)).toBeInTheDocument()
    await userEvent.click(addButton())
    await waitFor(() => expect(props.onSave).toHaveBeenCalled())
    expect(props.onSave.mock.calls[0]?.[0]).toMatchObject({ scope: 'shop' })
  })

  it('without the hint nothing is added, and the scope starts on Any Shop', async () => {
    const { props } = setup({ barcode: '08000500310427' })
    expect(within(dialog()).queryByText(/weighed goods/)).toBeNull()
    await choose(/Ingredient/, /^milk/)
    await userEvent.click(within(packGroup()).getByRole('button', { name: '1 l' }))
    await userEvent.click(addButton())
    await waitFor(() => expect(props.onSave).toHaveBeenCalled())
    expect(props.onSave.mock.calls[0]?.[0]).toMatchObject({ scope: 'global' })
  })
})

describe('NewProductSheet: focus after a step change (A11Y-07)', () => {
  const many: LineCandidate[] = Array.from({ length: 10 }, (_, i) => ({ ingredientId: 100 + i, name: `Line ${i}`, baseUnit: 'g', quantity: 100, ticked: false }))
  const inSheet = () => dialog().contains(document.activeElement) && document.activeElement !== dialog()

  it('More Lines keeps focus in the sheet, on the step\'s heading "Which Line is it?" (the focused chip is gone)', async () => {
    setup({ lines: many })
    await userEvent.click(within(lineGroup()).getByRole('button', { name: 'More Lines' }))
    const heading = within(dialog()).getByRole('heading', { name: 'Which Line is it?' })
    expect(heading).toHaveFocus()
    expect(heading).toHaveAttribute('tabindex', '-1')
  })

  it('Something else moves focus to the new step\'s heading "What it is"', async () => {
    setup({ lines: many })
    await userEvent.click(within(lineGroup()).getByRole('button', { name: 'Something else' }))
    expect(within(dialog()).getByRole('heading', { name: 'What it is' })).toHaveFocus()
  })

  it('picking a Line and "Pick another Line" never leave focus on <body>; the second goes back to "Which Line is it?"', async () => {
    setup({ lines: many })
    await userEvent.click(within(lineGroup()).getByRole('button', { name: /^Line 0/ }))
    expect(inSheet()).toBe(true)
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Pick another Line' }))
    expect(within(dialog()).getByRole('heading', { name: 'Which Line is it?' })).toHaveFocus()
  })

  it('the heading takes no ring when it is focused by the program', () => {
    expect(css).toMatch(/\[data-step-heading\][^{]*\{[^}]*outline:\s*none/s)
  })
})
