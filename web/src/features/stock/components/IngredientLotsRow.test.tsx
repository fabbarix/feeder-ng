// Beta.5 ST: a By Ingredient row that expands in place to that Ingredient's Lots (reconcile Q21, plan 2.6).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ListGroup } from '../../../ui'
import { makeLot, makeTotal } from '../testData'
import type { StoragePlace } from '../types'
import { IngredientLotsRow, type IngredientLotsRowProps } from './IngredientLotsRow'

const today = '2026-11-09' // a Monday
const places: StoragePlace[] = [
  { id: 3, name: 'Garage Fridge', kind: 'fridge', default: false },
  { id: 1, name: 'Kitchen Pantry', kind: 'pantry', default: true },
]
const later = makeLot({ id: 1, quantity: 800, purchased: '2026-11-09', goesOff: '2026-11-13', spoiled: false, storagePlaceId: 3 })
const sooner = makeLot({ id: 2, quantity: 500, purchased: '2026-11-08', goesOff: '2026-11-11', spoiled: false, useSoon: true, storagePlaceId: 3 })
const item = makeTotal({ ingredientId: 7, name: 'chicken thighs', total: 1300, lotCount: 2 })

function setup(over: Partial<IngredientLotsRowProps> = {}) {
  const onToggle = vi.fn()
  const onOpenLot = vi.fn()
  render(
    <ListGroup label="Stock">
      <IngredientLotsRow item={item} lots={[later, sooner]} places={places} today={today} expanded={false} onToggle={onToggle} onOpenLot={onOpenLot} {...over} />
    </ListGroup>,
  )
  return { onToggle, onOpenLot }
}

const disclosure = () => screen.getByRole('button', { name: 'Chicken thighs, 2 Stock Lots' })

describe('IngredientLotsRow', () => {
  it('collapsed: one disclosure button naming the Ingredient and its Lots, aria-expanded false, the Lots hidden', () => {
    setup()
    expect(disclosure()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Chicken thighs')).toBeInTheDocument()
    expect(screen.getByText('1300 g')).toBeInTheDocument()
    expect(screen.queryByText('Bought today · Good until Fri · Garage Fridge')).not.toBeVisible()
  })

  it('a click asks to toggle; the row does not flip by itself', async () => {
    const { onToggle } = setup()
    await userEvent.click(disclosure())
    expect(onToggle).toHaveBeenCalledOnce()
    expect(disclosure()).toHaveAttribute('aria-expanded', 'false')
  })

  it('expanded: lists the Lots in Deduction order, each with quantity and "Bought · Good until · Storage Place"', () => {
    setup({ expanded: true })
    expect(disclosure()).toHaveAttribute('aria-expanded', 'true')
    const list = screen.getByRole('list', { name: 'Chicken thighs Stock Lots' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('500 g')
    expect(rows[0]).toHaveTextContent('Bought yesterday · Good until Wed · Garage Fridge')
    expect(rows[1]).toHaveTextContent('800 g')
    expect(rows[1]).toHaveTextContent('Bought today · Good until Fri · Garage Fridge')
  })

  it('says "Not sorted" for a Lot in no Storage Place, and leaves out Good until without a go-off date', () => {
    setup({ expanded: true, lots: [makeLot({ id: 3, quantity: 200, purchased: '2026-11-05', goesOff: null, spoiled: false, storagePlaceId: null })] })
    expect(screen.getByText('Bought 5 Nov · Not sorted')).toBeInTheDocument()
  })

  it('says a Lot has gone off', () => {
    setup({ expanded: true, lots: [makeLot({ id: 4, quantity: 100, purchased: '2026-11-01', goesOff: '2026-11-08', spoiled: true, storagePlaceId: 1 })] })
    expect(screen.getByText('Bought 1 Nov · Went off yesterday · Kitchen Pantry')).toBeInTheDocument()
  })

  it('tapping a Lot opens it (the Lot sheet), and does not toggle the row', async () => {
    const { onOpenLot, onToggle } = setup({ expanded: true })
    await userEvent.click(within(screen.getByRole('list', { name: 'Chicken thighs Stock Lots' })).getByRole('button', { name: '500 g' }))
    expect(onOpenLot).toHaveBeenCalledWith(sooner)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('names a single Lot in the singular', () => {
    setup({ item: makeTotal({ ingredientId: 7, name: 'feta', total: 200, lotCount: 1 }), lots: [later] })
    expect(screen.getByRole('button', { name: 'Feta, 1 Stock Lot' })).toBeInTheDocument()
  })

  it('has no native control', () => {
    setup({ expanded: true })
    expect(document.querySelector('select, input, details, summary')).toBeNull()
  })
})
