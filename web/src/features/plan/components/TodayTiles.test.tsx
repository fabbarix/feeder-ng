import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { slot } from '../test-utils'
import type { Leftover } from '../types'
import { LeftoversTile, ToConfirmTile } from './TodayTiles'

describe('ToConfirmTile', () => {
  function setup() {
    const h = { onYesCooked: vi.fn(), onAdjust: vi.fn(), onNotCooked: vi.fn() }
    render(<ToConfirmTile slots={[slot({ date: '2026-11-09', courseId: 1, courseName: 'Main' })]} {...h} />)
    return h
  }

  it('lists the unconfirmed meal under the To confirm heading, a full-width tile', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'To confirm' })).toBeInTheDocument()
    expect(screen.getByText('Chicken curry')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'To confirm' }).closest('[data-span]')).toHaveAttribute('data-span', 'full')
  })

  it('offers Yes, Cooked (one tap), Adjust and Not cooked, each reporting the slot', async () => {
    const h = setup()
    const key = { date: '2026-11-09', mealSlotId: 2, courseId: 1 }
    const yes = screen.getByRole('button', { name: 'Yes, Cooked' })
    expect(yes).toHaveAttribute('data-variant', 'secondary')
    await userEvent.click(yes)
    expect(h.onYesCooked).toHaveBeenCalledWith(key)
    await userEvent.click(screen.getByRole('button', { name: 'Adjust' }))
    expect(h.onAdjust).toHaveBeenCalledWith(key)
    const not = screen.getByRole('button', { name: 'Not cooked' })
    expect(not).toHaveAttribute('data-variant', 'tertiary')
    await userEvent.click(not)
    expect(h.onNotCooked).toHaveBeenCalledWith(key)
  })

  it('renders nothing when there is nothing to confirm', () => {
    const { container } = render(<ToConfirmTile slots={[]} onYesCooked={() => {}} onAdjust={() => {}} onNotCooked={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('LeftoversTile', () => {
  const leftovers: Leftover[] = [
    { id: 1, recipeId: 1, recipeName: 'Chicken', portions: 2, cookedOn: '2026-11-08', useBy: '2026-11-09', fromDate: '2026-11-08', fromMealSlotId: 2 },
    { id: 2, recipeId: 2, recipeName: 'Stew', portions: 3, cookedOn: '2026-11-08', useBy: '2026-11-12', fromDate: '2026-11-08', fromMealSlotId: 2 },
  ]

  it('is a half status tile in the Leftover colour, one row per Leftover with portions and Use-by as meta', () => {
    const { container } = render(<LeftoversTile leftovers={leftovers} today="2026-11-09" />)
    expect(container.querySelector('[data-variant="status"][data-status="leftover"]')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Leftovers to use' })).toBeInTheDocument()
    expect(screen.getByText('Chicken')).toBeInTheDocument()
    expect(screen.getByText('2 portions · Use by today')).toBeInTheDocument()
    expect(screen.getByText('3 portions · Use by Thu')).toBeInTheDocument()
  })

  it('N2: the tile carries the plan-leftovers class, which lays the rows out as a stacked list', () => {
    const { container } = render(<LeftoversTile leftovers={leftovers} today="2026-11-09" />)
    expect(container.querySelector('.plan-leftovers[data-status="leftover"]')).not.toBeNull()
    expect(container.querySelectorAll('.plan-leftovers .list-row')).toHaveLength(2)
  })

  it('N2: the rows are rendered without the lead icon (the tile overline carries it), freeing the half-width cell', () => {
    const { container } = render(<LeftoversTile leftovers={leftovers} today="2026-11-09" />)
    expect(container.querySelectorAll('.plan-leftovers .list-row')).toHaveLength(2)
    expect(container.querySelector('.plan-leftovers .list-row__lead')).toBeNull()
    expect(container.querySelector('.plan-leftovers .list-row__leading')).toBeNull()
  })

  it('lists the soonest Use-by first', () => {
    render(<LeftoversTile leftovers={[...leftovers].reverse()} today="2026-11-09" />)
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent ?? '')
    expect(rows[0]).toContain('Chicken')
    expect(rows[1]).toContain('Stew')
  })

  it('the whole tile opens the Plan when asked to', async () => {
    const onOpen = vi.fn()
    render(<LeftoversTile leftovers={leftovers} today="2026-11-09" onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('button', { name: 'Leftovers to use' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('renders nothing without Leftovers', () => {
    const { container } = render(<LeftoversTile leftovers={[]} today="2026-11-09" />)
    expect(container).toBeEmptyDOMElement()
  })
})
