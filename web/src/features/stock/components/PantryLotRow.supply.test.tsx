// Supplies in the Pantry (household-items.md 4.2, 4.7; H6): a Supply's Lot row has no Good until, no Use soon or Spoiled tone, and
// says when it restocks.
import { cleanup, render, screen } from '@testing-library/react'
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
  // B9-29 (SSP-05): the quantity is in the value column, the meta is the status (or the Restock reason) alone.
  return { row, meta: row.querySelector('.list-row__meta') as HTMLElement, value: row.querySelector('.list-row__value') as HTMLElement, compact: row.querySelector('.list-row__meta-compact') }
}

describe('PantryLotRow for a Supply', () => {
  it('shows the quantity in the value column and the Restock level in the meta: "4 pieces", "Restocks below 6"', () => {
    const { meta, value } = setup(makeSupplyLot({ quantity: 4 }), { restock: { level: 6, stock: 9 } })
    expect(value).toHaveTextContent(/^4 pieces$/)
    expect(meta).toHaveTextContent(/^Restocks below 6$/)
  })
  it('shows only the quantity (no meta line) when the Supply has no Restock level', () => {
    const { meta, value } = setup(makeSupplyLot({ quantity: 1 }))
    expect(value).toHaveTextContent(/^1 piece$/)
    expect(meta).toBeNull()
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
  it('a Supply below its Restock level says so once, with the info status, never spoil or danger; its compact form is the Stock', () => {
    const { meta, value, compact } = setup(makeSupplyLot({ quantity: 2 }), { restock: { level: 6, stock: 2 } })
    expect(value).toHaveTextContent(/^2 pieces$/)
    expect(meta).toHaveTextContent(/Below 6 · 2 in Stock/)
    expect(meta).toHaveAttribute('data-status', 'info')
    expect(compact).toHaveTextContent(/^2 in Stock$/)
  })
  it('at the level it is not marked', () => {
    const { meta, value } = setup(makeSupplyLot({ quantity: 6 }), { restock: { level: 6, stock: 6 } })
    expect(value).toHaveTextContent('6 pieces')
    expect(meta).toHaveTextContent(/^Restocks below 6$/)
    expect(meta).not.toHaveAttribute('data-status')
  })
  it('measures a liquid in its Base Unit', () => {
    const { meta, value } = setup(makeSupplyLot({ baseUnit: 'ml', quantity: 500 }), { restock: { level: 1000, stock: 1500 } })
    expect(value).toHaveTextContent('500 ml')
    expect(meta).toHaveTextContent(/^Restocks below 1 l$/)
  })
  it('the quantity is never said twice on a row that is below its level ("400 ml · Below 1 l · 400 ml in Stock" was)', () => {
    const { row } = setup(makeSupplyLot({ baseUnit: 'ml', quantity: 400 }), { restock: { level: 1000, stock: 400 } })
    expect(row.querySelector('.list-row__meta')?.textContent ?? '').not.toMatch(/^400 ml ·/)
    expect(row.querySelector('.list-row__meta-text')).toHaveTextContent(/^Below 1 l · 400 ml in Stock$/)
  })
  it('shows the Storage Place at the end when not grouped, as for food', () => {
    const { row } = setup(makeSupplyLot(), { placeName: 'Utility cupboard' })
    expect(row).toHaveTextContent('Utility cupboard')
  })
})

describe('PantryLotRow for food (SSP-05: the status leads, the quantity is in the value column)', () => {
  it('says the status alone in the meta, in the spoil tone when due, and the quantity in the value', () => {
    const { meta, value } = setup(makeLot({ kind: 'food', quantity: 200, goesOff: '2026-11-12', useSoon: true, spoiled: false }))
    expect(value).toHaveTextContent(/^200 g$/)
    expect(meta).toHaveTextContent(/^Good until today$/)
    expect(meta).toHaveAttribute('data-status', 'spoil')
  })
  it('a Lot that went off says so alone, with the spoiled icon (not the hourglass of Use soon)', () => {
    const { meta } = setup(makeLot({ kind: 'food', goesOff: '2026-10-29', spoiled: true, useSoon: false }))
    expect(meta).toHaveTextContent(/^Went off 14 days ago$/)
    expect(meta).toHaveAttribute('data-status', 'spoil')
    const went = meta.querySelector('svg')?.outerHTML
    cleanup()
    const soon = setup(makeLot({ kind: 'food', goesOff: '2026-11-13', spoiled: false, useSoon: true })).meta.querySelector('svg')?.outerHTML
    expect(went).toBeTruthy()
    expect(went).not.toBe(soon)
  })
  it('a Lot with no go-off date says "No go-off date" and has no tone', () => {
    const { meta } = setup(makeLot({ kind: 'food', goesOff: null, spoiled: false, useSoon: false }))
    expect(meta).toHaveTextContent(/^No go-off date$/)
    expect(meta).not.toHaveAttribute('data-status')
  })
  it('has no chevron: a Stock Lot row opens a sheet, as Shop rows do', () => {
    const { row } = setup(makeLot({ kind: 'food', goesOff: null, spoiled: false }))
    expect(row.querySelector('.list-row__chevron')).toBeNull()
  })
  it('a food row ignores a restock prop', () => {
    const { meta } = setup(makeLot({ kind: 'food', goesOff: null }), { restock: { level: 6, stock: 1 } })
    expect(meta).not.toHaveTextContent(/restock/i)
  })
})
