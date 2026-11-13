import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeLine, makeList } from '../testData'
import { ShoppingBody } from './ShoppingBody'

// B5-SH (DS-SHOP): the body shows the Not needed group last. Its actions are in the row sheet now (onOpenLine), not on the row.

const base = { system: 'metric' as const, shopName: null, onTick: () => {}, onUntick: () => {}, onOpenLine: () => {}, onScan: () => {} }
const rice = makeLine({ ingredientId: 5, name: 'Rice', quantity: 600, pack: null, estimatedCostCents: null })

describe('ShoppingBody Not needed', () => {
  it('puts the collapsed "Not needed (N)" group after the open Lines and the Ticked group', () => {
    const ticked = makeLine({ ingredientId: 6, name: 'Salt', ticked: true, quantity: 0, pack: null, estimatedCostCents: null })
    const { container } = render(<ShoppingBody {...base} list={makeList({ lines: [makeLine(), ticked], notNeeded: [rice], progress: { ticked: 1, total: 2 } })} />)
    const tickedGroup = screen.getByRole('heading', { name: 'Ticked 1' })
    const toggle = screen.getByRole('button', { name: 'Not needed (1)' })
    expect(tickedGroup.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(container).not.toHaveTextContent('Rice')
  })

  it('shows no group when nothing is Not needed, and tolerates a list without the field', () => {
    render(<ShoppingBody {...base} list={makeList()} />)
    expect(screen.queryByRole('button', { name: /^Not needed/ })).toBeNull()
  })

  it('a list whose only lines are Not needed still shows the group, and the empty hint', () => {
    render(<ShoppingBody {...base} list={makeList({ lines: [], notNeeded: [rice], progress: { ticked: 0, total: 0 } })} />)
    expect(screen.getByRole('button', { name: 'Not needed (1)' })).toBeInTheDocument()
    expect(screen.getByText('Nothing to buy')).toBeInTheDocument()
  })

  it('opening the group lists its Lines as rows without a tick; a row tap passes the entry and the group "not-needed"', async () => {
    const onOpenLine = vi.fn()
    render(<ShoppingBody {...base} onOpenLine={onOpenLine} list={makeList({ lines: [], notNeeded: [rice], progress: { ticked: 0, total: 0 } })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Not needed (1)' }))
    const list = screen.getByRole('list', { name: 'Not needed' })
    expect(within(list).queryByRole('button', { name: /^Tick/ })).toBeNull()
    await userEvent.click(within(list).getByRole('button', { name: 'Rice' }))
    expect(onOpenLine).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ ingredientId: 5 }), 'not-needed')
  })

  it('Not needed Lines do not feed the metrics or the notice', () => {
    const list = makeList({ lines: [], notNeeded: [makeLine({ ingredientId: 5, name: 'Rice', pastPlannedMeals: [{ date: '2026-11-03', mealSlotId: 3, mealSlotName: 'Dinner', courseName: 'Main' }] })], progress: { ticked: 0, total: 0 } })
    render(<ShoppingBody {...base} list={list} onMarkIt={() => {}} />)
    expect(screen.queryByRole('region', { name: 'Not marked Cooked yet' })).toBeNull()
  })
})
