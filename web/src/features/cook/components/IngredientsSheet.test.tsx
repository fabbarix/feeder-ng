// B9-45 (PC-05): the Ingredients button during cooking opens the same list in a sheet with the R-B Close (on a phone; from 1024 px it sits in the rail).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ReadySection } from '../lib/ingredients'
import { IngredientsSheet } from './IngredientsSheet'

const row = (key: string, name: string, amount: string, place: string | null) => ({ key, ingredientId: Number(key), name, amount, place, optional: false })
const sections: ReadySection[] = [{ key: 's', title: null, rows: [row('1', 'Chicken', '1.2 kg', 'Fridge'), row('2', 'Rice', '300 g', 'Pantry')] }]
const props = { open: true, onClose: () => {}, context: 'Roast chicken · 2.75 portions', meta: 'For 2.75 portions: 1 Batch of 4 portions, 1.25 kept as a Leftover', sections, ticked: new Set<string>(), onToggle: () => {} }

describe('IngredientsSheet', () => {
  it('is titled "Ingredients" with the Recipe and portions as its context and the meta line first', () => {
    render(<IngredientsSheet {...props} />)
    const dialog = screen.getByRole('dialog', { name: /Ingredients/ })
    expect(within(dialog).getByRole('heading', { name: 'Ingredients' })).toBeInTheDocument()
    expect(within(dialog).getByText('Roast chicken · 2.75 portions')).toBeInTheDocument()
    expect(within(dialog).getByText(props.meta)).toBeInTheDocument()
  })

  it('lists the same rows as Get ready: name, Storage Place, amount, and a named checkbox', () => {
    render(<IngredientsSheet {...props} />)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('checkbox', { name: 'Chicken, 1.2 kg' })).toBeInTheDocument()
    expect(dialog.querySelector('li.list-row .list-row__meta')).toHaveTextContent('Fridge')
    expect(dialog.querySelector('li.list-row .list-row__value')).toHaveTextContent('1.2 kg')
  })

  it('shares its ticks with Get ready: a ticked row is checked, and ticking reports the key', async () => {
    const onToggle = vi.fn()
    render(<IngredientsSheet {...props} ticked={new Set(['2'])} onToggle={onToggle} />)
    expect(screen.getByRole('checkbox', { name: 'Rice, 300 g' })).toBeChecked()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Chicken, 1.2 kg' }))
    expect(onToggle).toHaveBeenCalledWith('1')
  })

  it('has the one circular Close (R-B) and calls onClose', async () => {
    const onClose = vi.fn()
    render(<IngredientsSheet {...props} onClose={onClose} />)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getAllByRole('button', { name: 'Close' })).toHaveLength(1)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('is not in the document while closed', () => {
    render(<IngredientsSheet {...props} open={false} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
