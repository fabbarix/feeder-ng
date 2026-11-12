import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { makeLine, makeList, makePast } from '../testData'
import { ShoppingBody } from './ShoppingBody'

// B5-SH: the body shows the Not needed group last and passes the line actions down.

const base = { system: 'metric' as const, shopName: null, onTick: () => {}, onUntick: () => {}, onDelete: () => {}, onScan: () => {} }
const rice = makeLine({ ingredientId: 5, name: 'Rice', quantity: 600, pack: null, estimatedCostCents: null })

describe('ShoppingBody Not needed', () => {
  it('puts the collapsed "Not needed (N)" group after the open Lines and the Ticked group', () => {
    const ticked = makeLine({ ingredientId: 6, name: 'Salt', ticked: true, quantity: 0, pack: null, estimatedCostCents: null })
    const { container } = render(<MemoryRouter><ShoppingBody {...base} list={makeList({ lines: [makeLine(), ticked], notNeeded: [rice], progress: { ticked: 1, total: 2 } })} /></MemoryRouter>)
    const tickedGroup = screen.getByRole('heading', { name: 'Ticked (1)' })
    const toggle = screen.getByRole('button', { name: 'Not needed (1)' })
    expect(tickedGroup.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(container).not.toHaveTextContent('Rice')
  })

  it('shows no group when nothing is Not needed, and tolerates a list without the field', () => {
    render(<MemoryRouter><ShoppingBody {...base} list={makeList()} /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: /^Not needed/ })).toBeNull()
  })

  it('a list whose only lines are Not needed still shows the group, and the empty hint', () => {
    render(<MemoryRouter><ShoppingBody {...base} list={makeList({ lines: [], notNeeded: [rice], progress: { ticked: 0, total: 0 } })} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Not needed (1)' })).toBeInTheDocument()
    expect(screen.getByText('Nothing to buy')).toBeInTheDocument()
  })

  it('open Lines get the Menu when onNotNeeded is given; the progress counts the server numbers only', async () => {
    const onNotNeeded = vi.fn()
    render(<MemoryRouter><ShoppingBody {...base} onNotNeeded={onNotNeeded} list={makeList({ lines: [makeLine()], notNeeded: [rice], progress: { ticked: 0, total: 1 } })} /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Passata' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Not needed' }))
    expect(onNotNeeded).toHaveBeenCalledWith(expect.objectContaining({ ingredientId: 2 }))
  })

  it('"Needed after all" in the opened group calls onNeededAfterAll with the entry', async () => {
    const onNeededAfterAll = vi.fn()
    render(<MemoryRouter><ShoppingBody {...base} onNeededAfterAll={onNeededAfterAll} list={makeList({ lines: [], notNeeded: [rice], progress: { ticked: 0, total: 0 } })} /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: 'Not needed (1)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Needed after all: Rice' }))
    expect(onNeededAfterAll).toHaveBeenCalledWith(expect.objectContaining({ ingredientId: 5 }))
  })

  it('shows the hint on a Line with unconfirmed past meals and "Mark it" only when onMarkIt is passed', () => {
    const list = makeList({ lines: [makeLine({ pastPlannedMeals: [makePast()] })] })
    const { rerender } = render(<MemoryRouter><ShoppingBody {...base} list={list} /></MemoryRouter>)
    expect(screen.getByText('Includes Tue Dinner, not marked Cooked yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Mark it/ })).toBeNull()
    rerender(<MemoryRouter><ShoppingBody {...base} list={list} onMarkIt={() => {}} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: /Mark it/ })).toBeInTheDocument()
  })
})
