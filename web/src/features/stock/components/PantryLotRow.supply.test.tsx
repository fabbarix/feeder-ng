// Supplies in the Pantry (household-items.md 4.2, 4.7; H6): a Supply's Lot row has no Good until, no Use soon or Spoiled tone, and
// says when it restocks.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ListGroup } from '../../../ui'
import { makeLot, makeSupplyLot } from '../testData'
import type { StockLot } from '../types'
import { PantryLotRow, type PantryLotRowProps } from './PantryLotRow'

function setup(lot: StockLot, over: Partial<PantryLotRowProps> = {}) {
  render(
    <ListGroup label="Kitchen Pantry, 1 Stock Lot">
      <PantryLotRow lot={lot} today="2026-11-12" onOpen={() => {}} {...over} />
    </ListGroup>,
  )
  const row = screen.getByRole('listitem')
  return { row, meta: row.querySelector('.list-row__meta') as HTMLElement }
}

describe('PantryLotRow for a Supply', () => {
  it('shows the quantity and the Restock level: "4 pieces · restocks below 6"', () => {
    const { meta } = setup(makeSupplyLot({ quantity: 4 }), { restock: { level: 6, stock: 9 } })
    expect(meta).toHaveTextContent('4 pieces · restocks below 6')
  })
  it('shows only the quantity when the Supply has no Restock level', () => {
    const { meta } = setup(makeSupplyLot({ quantity: 1 }))
    expect(meta).toHaveTextContent(/^1 piece$/)
  })
  it('never says Good until, "No go-off date", went off or Use soon', () => {
    const { row } = setup(makeSupplyLot(), { restock: { level: 6, stock: 9 } })
    expect(row).not.toHaveTextContent(/good until|go-off|went off|use soon|spoiled/i)
  })
  it('has no Use soon or Spoiled tone, even with stray flags and a stray go-off date', () => {
    const { meta } = setup(makeSupplyLot({ useSoon: true, spoiled: true, goesOff: '2026-11-01' }), { restock: { level: 6, stock: 9 } })
    expect(meta).not.toHaveAttribute('data-status', 'spoil')
    expect(meta).not.toHaveAttribute('data-status', 'danger')
    expect(meta).not.toHaveTextContent(/good until|went off/i)
  })
  it('a Supply below its Restock level is marked in words and with the info status, never spoil or danger', () => {
    const { meta } = setup(makeSupplyLot({ quantity: 2 }), { restock: { level: 6, stock: 2 } })
    expect(meta).toHaveTextContent('2 pieces · below Restock level 6')
    expect(meta).toHaveAttribute('data-status', 'info')
  })
  it('at the level it is not marked', () => {
    const { meta } = setup(makeSupplyLot({ quantity: 6 }), { restock: { level: 6, stock: 6 } })
    expect(meta).toHaveTextContent('6 pieces · restocks below 6')
    expect(meta).not.toHaveAttribute('data-status')
  })
  it('measures a liquid in its Base Unit', () => {
    const { meta } = setup(makeSupplyLot({ baseUnit: 'ml', quantity: 500 }), { restock: { level: 1000, stock: 1500 } })
    expect(meta).toHaveTextContent('500 ml · restocks below 1000 ml')
  })
  it('shows the Storage Place at the end when not grouped, as for food', () => {
    const { row } = setup(makeSupplyLot(), { placeName: 'Utility cupboard' })
    expect(row).toHaveTextContent('Utility cupboard')
  })
})

describe('PantryLotRow for food is unchanged', () => {
  it('still says Good until, in the spoil tone when due', () => {
    const { meta } = setup(makeLot({ kind: 'food', quantity: 200, goesOff: '2026-11-12', useSoon: true, spoiled: false }))
    expect(meta).toHaveTextContent('200 g · Good until today')
    expect(meta).toHaveAttribute('data-status', 'spoil')
  })
  it('a food row ignores a restock prop', () => {
    const { meta } = setup(makeLot({ kind: 'food', goesOff: null }), { restock: { level: 6, stock: 1 } })
    expect(meta).not.toHaveTextContent(/restock/i)
  })
})
