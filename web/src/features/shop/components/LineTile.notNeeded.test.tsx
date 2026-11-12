import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { makeExtra, makeLine, makePast } from '../testData'
import { extraEntry, lineEntry } from '../lib/lines'
import { LineTile } from './LineTile'

// B5-SH: the line Menu with "Not needed", the hint for unconfirmed past meals and the optional "Mark it".

const open = lineEntry(makeLine(), 'USD', 'metric')
const withHint = lineEntry(makeLine({ pastPlannedMeals: [makePast()] }), 'USD', 'metric')
const none = () => {}

describe('LineTile Not needed', () => {
  it('an open Line with onNotNeeded has a Menu named for the Ingredient, with a "Not needed" item', async () => {
    const onNotNeeded = vi.fn()
    render(<MemoryRouter><LineTile entry={open} onTick={none} onUntick={none} onNotNeeded={onNotNeeded} /></MemoryRouter>)
    const trigger = screen.getByRole('button', { name: 'Actions for Passata' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    await userEvent.click(trigger)
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Not needed' }))
    expect(onNotNeeded).toHaveBeenCalledWith(open)
  })

  it('has no Menu without onNotNeeded', () => {
    render(<MemoryRouter><LineTile entry={open} onTick={none} onUntick={none} /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: /Actions for/ })).toBeNull()
  })

  it('has no Menu on a ticked Line (Not needed is for open Lines) or on an extra', () => {
    const ticked = lineEntry(makeLine({ ticked: true, quantity: 0, pack: null, estimatedCostCents: null }), 'USD', 'metric')
    const { rerender } = render(<MemoryRouter><LineTile entry={ticked} onTick={none} onUntick={none} onNotNeeded={none} /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: /Actions for/ })).toBeNull()
    rerender(<MemoryRouter><LineTile entry={extraEntry(makeExtra(), 'metric')} onTick={none} onUntick={none} onNotNeeded={none} onDelete={none} /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: /Actions for/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Delete toilet paper' })).toBeInTheDocument()
  })

  it('the Menu does not tick the Line', async () => {
    const onTick = vi.fn()
    render(<MemoryRouter><LineTile entry={open} onTick={onTick} onUntick={none} onNotNeeded={none} /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Passata' }))
    expect(onTick).not.toHaveBeenCalled()
  })
})

describe('LineTile hint', () => {
  it('shows the hint under the name, inside the tile', () => {
    const { container } = render(<MemoryRouter><LineTile entry={withHint} onTick={none} onUntick={none} /></MemoryRouter>)
    const hint = container.querySelector('.line-tile__hint')
    expect(hint).toHaveTextContent('Includes Tue Dinner, not marked Cooked yet')
    expect(container.querySelector('.line-tile__body')).toContainElement(hint as HTMLElement)
  })

  it('shows no hint element for a Line without unconfirmed past meals', () => {
    const { container } = render(<MemoryRouter><LineTile entry={open} onTick={none} onUntick={none} /></MemoryRouter>)
    expect(container.querySelector('.line-tile__hint')).toBeNull()
  })

  it('ships without "Mark it": the button needs the onMarkIt callback (F1 supplies the /plan#to-confirm target later)', () => {
    render(<MemoryRouter><LineTile entry={withHint} onTick={none} onUntick={none} onNotNeeded={none} /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: /Mark it/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Mark it/ })).toBeNull()
  })

  it('with onMarkIt, a "Mark it" button sits beside the hint and calls back with the entry', async () => {
    const onMarkIt = vi.fn()
    const { container } = render(<MemoryRouter><LineTile entry={withHint} onTick={none} onUntick={none} onMarkIt={onMarkIt} /></MemoryRouter>)
    const button = screen.getByRole('button', { name: /Mark it/ })
    expect(button).toHaveTextContent('Mark it')
    expect(within(container.querySelector('.line-tile__body') as HTMLElement).getByRole('button', { name: /Mark it/ })).toBe(button)
    await userEvent.click(button)
    expect(onMarkIt).toHaveBeenCalledWith(withHint)
  })

  it('"Mark it" is not shown for a Line without a hint, even with onMarkIt', () => {
    render(<MemoryRouter><LineTile entry={open} onTick={none} onUntick={none} onMarkIt={none} /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: /Mark it/ })).toBeNull()
  })
})
