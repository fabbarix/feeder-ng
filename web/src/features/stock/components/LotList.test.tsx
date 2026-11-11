import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeLot } from '../testData'
import { LotList } from './LotList'

describe('LotList', () => {
  it('is a labelled ListGroup with one ListRow per lot: amount, bought-on and source, go-off wording', () => {
    render(
      <LotList
        today="2026-11-09"
        lots={[
          makeLot({ id: 1, quantity: 500, goesOff: '2026-11-12', source: 'scan', spoiled: false, useSoon: true, purchased: '2026-11-01' }),
          makeLot({ id: 2, quantity: 300, goesOff: null, source: 'stock_take', purchased: '2026-11-09', spoiled: false }),
        ]}
      />,
    )
    expect(screen.getByRole('list', { name: 'Stock Lots' })).toBeInTheDocument()
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]!).getByText('500 g')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('Good until Thu')).toBeInTheDocument()
    expect(within(rows[0]!).getByText(/Scanned/)).toBeInTheDocument()
    expect(within(rows[0]!).getByText(/Bought 1 Nov/)).toBeInTheDocument()
    expect(within(rows[1]!).getByText('No go-off date')).toBeInTheDocument()
    expect(within(rows[1]!).getByText(/Stock-take/)).toBeInTheDocument()
  })

  it('formats the bought-on date en-GB and keeps a single space around the dot', () => {
    render(<LotList today="2026-11-09" lots={[makeLot({ purchased: '2026-11-05', source: 'scan' })]} />)
    const meta = document.querySelector('.list-row__meta')
    expect(meta?.textContent).toBe('Bought 5 Nov · Scanned')
    expect(meta?.textContent).not.toMatch(/\s{2,}/)
  })

  it('offers Throw out only on spoiled lot rows, and reports the lot', async () => {
    const onThrowOut = vi.fn()
    render(
      <LotList
        today="2026-11-09"
        onThrowOut={onThrowOut}
        lots={[makeLot({ id: 1, spoiled: true }), makeLot({ id: 2, spoiled: false, goesOff: '2026-11-12' }), makeLot({ id: 3, spoiled: false, goesOff: null })]}
      />,
    )
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]!).getByRole('button', { name: /Throw out/ })).toBeInTheDocument()
    expect(within(rows[1]!).queryByRole('button', { name: /Throw out/ })).toBeNull()
    expect(within(rows[2]!).queryByRole('button', { name: /Throw out/ })).toBeNull()
    await userEvent.click(within(rows[0]!).getByRole('button', { name: /Throw out/ }))
    expect(onThrowOut).toHaveBeenCalledWith(1)
  })

  it('Throw out is an icon-only IconButton named "Throw out <name> lot" next to the chip (390 px fit)', () => {
    render(<LotList today="2026-11-09" onThrowOut={vi.fn()} lots={[makeLot({ id: 1, ingredientName: 'chicken thighs', spoiled: true })]} />)
    const button = screen.getByRole('button', { name: 'Throw out chicken thighs lot' })
    expect(button).toHaveClass('icon-button')
    expect(button).toHaveAttribute('aria-label', 'Throw out chicken thighs lot')
    expect(button.textContent).toBe('')
    expect(button.querySelector('svg')).not.toBeNull()
    expect(button.closest('.list-row')).not.toBeNull()
    const actions = button.closest('.lot-list__actions') as HTMLElement
    expect(actions).not.toBeNull()
    expect(actions.querySelector('.chip')).not.toBeNull()
    expect(actions.querySelector('.btn, .button')).toBeNull() // no text Button left in the actions
    expect(actions.textContent).not.toMatch(/Throw out/)
  })

  it('offers no Throw out at all without a handler', () => {
    render(<LotList today="2026-11-09" lots={[makeLot({ spoiled: true })]} />)
    expect(screen.queryByRole('button', { name: /Throw out/ })).toBeNull()
  })

  it('marks a lot that is going off with a spoil state chip', () => {
    render(<LotList today="2026-11-09" lots={[makeLot({ goesOff: '2026-11-05' })]} />)
    const chip = screen.getByText('Went off 3 days ago').closest('.chip')
    expect(chip).toHaveAttribute('data-status', 'spoil')
    expect(chip).toHaveAttribute('data-kind', 'state')
  })

  it('takes the colour from the server flags: use soon is spoil, plain is a neutral tag', () => {
    render(
      <LotList
        today="2026-11-09"
        lots={[
          makeLot({ id: 1, goesOff: '2026-11-12', spoiled: false, useSoon: true }),
          makeLot({ id: 2, goesOff: '2026-11-13', spoiled: false, useSoon: false }),
        ]}
      />,
    )
    expect(screen.getByText('Good until Thu').closest('.chip')).toHaveAttribute('data-status', 'spoil')
    const plain = screen.getByText('Good until Fri').closest('.chip')
    expect(plain).toHaveAttribute('data-kind', 'tag')
    expect(plain).not.toHaveAttribute('data-status')
  })
})
