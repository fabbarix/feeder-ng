import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { favourite, meal, slot } from '../test-utils'
import type { Leftover } from '../types'
import { CouldntPlanNotice, LeftoversTile, NextMealTile, ToConfirmTile } from './TodayTiles'

describe('NextMealTile', () => {
  it('shows the Recipe, Meal Slot, time and the first why chip', () => {
    render(<NextMealTile slot={slot({ meal: meal({ why: [favourite('Anna'), { code: 'stock_coverage' }] }) })} />)
    expect(screen.getByText('Chicken curry')).toBeInTheDocument()
    expect(screen.getByText(/Dinner/)).toBeInTheDocument()
    expect(screen.getByText(/19:00/)).toBeInTheDocument()
    expect(screen.getByText("Anna's favourite")).toBeInTheDocument()
    expect(screen.queryByText('already in Stock')).not.toBeInTheDocument()
  })

  it('says so when nothing is planned', () => {
    render(<NextMealTile slot={null} />)
    expect(screen.getByText('Nothing planned')).toBeInTheDocument()
  })
})

describe('ToConfirmTile', () => {
  it('lists unconfirmed meals with Mark as Cooked and Not cooked', async () => {
    const onCooked = vi.fn()
    const onNotCooked = vi.fn()
    render(<ToConfirmTile slots={[slot({ date: '2026-11-09' })]} onCooked={onCooked} onNotCooked={onNotCooked} />)
    expect(screen.getByRole('heading', { name: 'To confirm' })).toBeInTheDocument()
    expect(screen.getByText('Chicken curry')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Mark as Cooked' }))
    expect(onCooked).toHaveBeenCalledWith({ date: '2026-11-09', mealSlotId: 2 })
    await userEvent.click(screen.getByRole('button', { name: 'Not cooked' }))
    expect(onNotCooked).toHaveBeenCalledWith({ date: '2026-11-09', mealSlotId: 2 })
  })

  it('renders nothing when there is nothing to confirm', () => {
    const { container } = render(<ToConfirmTile slots={[]} onCooked={() => {}} onNotCooked={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('CouldntPlanNotice', () => {
  it('words each slot the planner left empty', () => {
    const empty = slot({
      date: '2026-11-12', meal: null,
      unfilled: { reason: 'no_attendance', slotRuleClaimed: false, eliminated: { considered: 0, exclusion: 0, coolDown: 0, varietyRule: 0, advanceStep: 0 } },
    })
    render(<CouldntPlanNotice slots={[empty]} />)
    expect(screen.getByRole('status')).toHaveTextContent("Couldn't plan Thursday dinner: nobody is attending.")
  })

  it('renders nothing when everything was planned', () => {
    const { container } = render(<CouldntPlanNotice slots={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('LeftoversTile', () => {
  const leftovers: Leftover[] = [
    { id: 1, recipeId: 1, recipeName: 'Chicken', portions: 2, cookedOn: '2026-11-08', useBy: '2026-11-09', fromDate: '2026-11-08', fromMealSlotId: 2 },
    { id: 2, recipeId: 2, recipeName: 'Stew', portions: 3, cookedOn: '2026-11-08', useBy: '2026-11-12', fromDate: '2026-11-08', fromMealSlotId: 2 },
  ]

  it('lists the Leftovers with their Use-by, the urgent one in the spoil tone', () => {
    render(<LeftoversTile leftovers={leftovers} today="2026-11-09" />)
    expect(screen.getByRole('heading', { name: 'Leftovers to use' })).toBeInTheDocument()
    expect(screen.getByText('Use by today').closest('[data-tone]')).toHaveAttribute('data-tone', 'spoil')
    expect(screen.getByText('Use by Thu').closest('[data-tone]')).toHaveAttribute('data-tone', 'leftover')
    expect(screen.getByText('3 portions')).toBeInTheDocument()
  })

  it('renders nothing without Leftovers', () => {
    const { container } = render(<LeftoversTile leftovers={[]} today="2026-11-09" />)
    expect(container).toBeEmptyDOMElement()
  })
})
