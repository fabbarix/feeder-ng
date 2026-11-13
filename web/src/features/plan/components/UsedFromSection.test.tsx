import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { LineView } from '../lib/usedFrom'
import { UsedFromSection, type UsedFromSectionProps } from './UsedFromSection'

const lines: LineView[] = [
  {
    ingredientId: 11, title: 'Chicken thighs · 800 g', state: 'short', message: '500 g of 800 g chosen. The rest follows soonest to go off first.', empty: null,
    lots: [
      { lotId: 1, label: '500 g · Fridge', meta: 'Good until 14 Nov · Bought 9 Nov', picked: true, amount: 500, max: 500, unit: 'g', amountLabel: 'Amount used from Fridge' },
      { lotId: 2, label: '600 g · Freezer', meta: 'Good until 1 Feb · Bought 9 Nov', picked: false, amount: 0, max: 600, unit: 'g', amountLabel: 'Amount used from Freezer' },
    ],
  },
  { ingredientId: 12, title: 'Rice · 200 g', state: 'none', message: null, empty: 'No Stock of this Ingredient', lots: [] },
]

function setup(over: Partial<UsedFromSectionProps> = {}) {
  const h = { onToggleExpanded: vi.fn(), onToggle: vi.fn(), onAmount: vi.fn() }
  const props: UsedFromSectionProps = { summary: 'Your choice for 1 Ingredient', lines, expanded: true, ...h, ...over }
  render(<UsedFromSection {...props} />)
  return h
}

describe('UsedFromSection', () => {
  it('shows the Used from row with the summary, as a disclosure button', () => {
    setup({ expanded: false, summary: 'Soonest to go off first' })
    const b = screen.getByRole('button', { name: /Used from/ })
    expect(b).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Soonest to go off first')).toBeInTheDocument()
  })

  it('toggling the row calls onToggleExpanded', async () => {
    const h = setup({ expanded: false })
    await userEvent.click(screen.getByRole('button', { name: /Used from/ }))
    expect(h.onToggleExpanded).toHaveBeenCalledTimes(1)
  })

  it('lists each Ingredient line with its Lots as shared Checkboxes', () => {
    setup()
    expect(screen.getByText('Chicken thighs · 800 g')).toBeVisible()
    const fridge = screen.getByRole('checkbox', { name: /500 g · Fridge/ })
    expect(fridge).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /600 g · Freezer/ })).not.toBeChecked()
    expect(screen.getByText('Good until 14 Nov · Bought 9 Nov')).toBeVisible()
    expect(fridge.closest('.checkbox')).not.toBeNull()
  })

  it('ticking a Lot reports it', async () => {
    const h = setup()
    await userEvent.click(screen.getByRole('checkbox', { name: /600 g · Freezer/ }))
    expect(h.onToggle).toHaveBeenCalledWith(11, 2, true)
    await userEvent.click(screen.getByRole('checkbox', { name: /500 g · Fridge/ }))
    expect(h.onToggle).toHaveBeenCalledWith(11, 1, false)
  })

  it('a picked Lot has an amount field (shared NumberField) bounded by the Lot; an unpicked one has none', async () => {
    const h = setup()
    const amount = screen.getByRole('spinbutton', { name: 'Amount used from Fridge' })
    expect(amount).toHaveAttribute('aria-valuenow', '500')
    expect(amount).toHaveAttribute('aria-valuemax', '500')
    expect(screen.queryByRole('spinbutton', { name: 'Amount used from Freezer' })).toBeNull()
    await userEvent.clear(amount)
    await userEvent.type(amount, '250{Enter}')
    expect(h.onAmount).toHaveBeenCalledWith(11, 1, 250)
  })

  it('the amount field shows the unit', () => {
    setup()
    const field = screen.getByRole('spinbutton', { name: 'Amount used from Fridge' })
    expect(field.closest('.ui-field')!.querySelector('.ui-field__suffix')).toHaveTextContent('g')
  })

  it('clearing the amount reports null so the pick is cleared', async () => {
    const h = setup()
    const amount = screen.getByRole('spinbutton', { name: 'Amount used from Fridge' })
    await userEvent.clear(amount)
    await userEvent.type(amount, '{Enter}')
    expect(h.onAmount).toHaveBeenCalledWith(11, 1, null)
  })

  it('shows the short message and the no-Stock notice', () => {
    setup()
    expect(screen.getByText('500 g of 800 g chosen. The rest follows soonest to go off first.')).toBeVisible()
    expect(screen.getByText('No Stock of this Ingredient')).toBeVisible()
    expect(within(screen.getByText('Rice · 200 g').closest('section, div, li')!).queryAllByRole('checkbox')).toHaveLength(0)
  })

  it('shows cross-Course conflicts as alerts', () => {
    setup({
      conflicts: [
        { lotId: 1, message: 'Chicken thighs: the Courses together take more from the 500 g Lot in Fridge than it holds' },
        { lotId: 4, message: 'Chicken thighs: the Courses together take more from the 300 g Lot in Fridge than it holds' },
      ],
    })
    const alerts = screen.getAllByRole('alert')
    expect(alerts).toHaveLength(2)
    expect(alerts[0]).toHaveTextContent('500 g Lot in Fridge')
    expect(alerts[1]).toHaveTextContent('300 g Lot in Fridge')
  })

  it('collapsed, the Lots are not visible', () => {
    setup({ expanded: false })
    expect(screen.queryByText('Chicken thighs · 800 g')).not.toBeVisible()
  })

  it('carries the styling hooks of usedFrom.css', () => {
    const { container } = render(<UsedFromSection summary="s" lines={lines} expanded onToggleExpanded={vi.fn()} onToggle={vi.fn()} onAmount={vi.fn()} conflicts={[{ lotId: 1, message: 'm' }]} />)
    for (const cls of ['used-from__panel', 'used-from__line', 'used-from__lot', 'used-from__message', 'used-from__conflict']) {
      expect(container.querySelector(`.${cls}`), cls).not.toBeNull()
    }
  })

  it('uses no native select and no browser dialog', () => {
    setup()
    expect(document.querySelector('select')).toBeNull()
  })
})
