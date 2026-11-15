// Supplies in the Pantry (household-items.md 4.2, 4.6; H6): a Supply in By Ingredient, with its Lots inline.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ListGroup } from '../../../ui'
import { makeSupplyLot, makeSupplyTotal } from '../testData'
import type { StoragePlace } from '../types'
import { IngredientLotsRow, type IngredientLotsRowProps } from './IngredientLotsRow'

const places: StoragePlace[] = [{ id: 1, name: 'Utility cupboard', kind: 'pantry', default: false }]
const a = makeSupplyLot({ id: 1, quantity: 3, purchased: '2026-11-09', storagePlaceId: 1 })
const b = makeSupplyLot({ id: 2, quantity: 6, purchased: '2026-11-01', storagePlaceId: 1 })
const item = makeSupplyTotal({ total: 9, lotCount: 2 })

function setup(over: Partial<IngredientLotsRowProps> = {}) {
  const onOpenLot = vi.fn()
  render(
    <ListGroup label="Stock">
      <IngredientLotsRow item={item} lots={[a, b]} places={places} today="2026-11-12" expanded onToggle={() => {}} onOpenLot={onOpenLot} {...over} />
    </ListGroup>,
  )
  return { onOpenLot, row: screen.getAllByRole('listitem')[0]! }
}

describe('IngredientLotsRow for a Supply', () => {
  it('shows the total, the Lot count and "Restocks below 6"; no go-off phrase, no Use soon tone', () => {
    const { row } = setup({ restock: { level: 6, stock: 9 } })
    expect(screen.getByText('9 pieces', { selector: '[aria-hidden="true"]' })).toBeInTheDocument() // B9-55: <Quantity> also says it, visually hidden
    const meta = row.querySelector('.list-row__meta') as HTMLElement
    expect(meta).toHaveTextContent('2 Stock Lots · Restocks below 6')
    expect(meta).not.toHaveAttribute('data-status', 'spoil')
  })
  it('its narrow (compact) meta is the Restock status alone: "Restocks below 6", or "2 in Stock" below the level (SSP-05)', () => {
    const { row } = setup({ restock: { level: 6, stock: 9 } })
    expect(row.querySelector('.list-row__meta-compact')).toHaveTextContent(/^Restocks below 6$/)
  })
  it('a Supply below its Restock level says so, with the info status', () => {
    const { row } = setup({ item: makeSupplyTotal({ total: 2, lotCount: 2 }), restock: { level: 6, stock: 2 } })
    const meta = row.querySelector('.list-row__meta') as HTMLElement
    expect(meta).toHaveTextContent('2 Stock Lots · Below 6 · 2 in Stock')
    expect(meta).toHaveAttribute('data-status', 'info')
  })
  it('a stray use soon flag on the row does not tint it', () => {
    const { row } = setup({ item: makeSupplyTotal({ useSoon: true, spoiledCount: 1, nextGoesOff: '2026-11-12', lotCount: 2 }) })
    const meta = row.querySelector('.list-row__meta') as HTMLElement
    expect(meta).toHaveTextContent(/^2 Stock Lots$/)
    expect(meta).not.toHaveAttribute('data-status')
  })
  it('its Lots say "Bought ... · Storage Place" and never "No go-off date" or Good until', () => {
    setup()
    const list = screen.getByRole('list', { name: 'Toilet paper Stock Lots' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('6 pieces')
    expect(rows[0]).toHaveTextContent('Bought 1 Nov · Utility cupboard')
    expect(list).not.toHaveTextContent(/go-off|good until|went off/i)
    for (const r of rows) expect(r.querySelector('.list-row__meta')).not.toHaveAttribute('data-status')
  })
  it('a Lot opens the Lot sheet', async () => {
    const { onOpenLot } = setup()
    await userEvent.click(within(screen.getByRole('list', { name: 'Toilet paper Stock Lots' })).getAllByRole('button')[0]!)
    expect(onOpenLot).toHaveBeenCalledWith(b)
  })
})
