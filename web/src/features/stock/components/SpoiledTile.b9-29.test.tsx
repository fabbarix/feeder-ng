// B9-29 (SSP-05, SSP-17, DS-06): "Throw out or keep?" in beta.9.
//   - the tile is food going off, so it keeps the spoil tone (data-status="spoil"); danger is loss (DS-06, decision DS 3). The file is listed
//     in scripts/check-ui.allow-tones with that reason
//   - the status leads the row's meta, then the quantity: "Went off 14 days ago · 200 g" (SSP-05: a status leads its meta line)
//   - Throw out is the outlined danger secondary, Keep the outlined secondary (R-A); the accessible names stay "Throw out <name>" / "Keep <name>"
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { makeLot } from '../testData'
import { SpoiledTile } from './SpoiledTile'

const today = '2026-11-09'
const setup = () =>
  render(<SpoiledTile today={today} lots={[makeLot({ id: 1, ingredientName: 'flour', quantity: 500, goesOff: '2026-10-02' })]} onThrowOut={() => {}} onKeep={() => {}} />)

describe('SpoiledTile (beta.9)', () => {
  it('is a spoil tile, never a danger one', () => {
    setup()
    expect(screen.getByRole('region', { name: 'Throw out or keep?' })).toHaveAttribute('data-status', 'spoil')
  })
  it('says the status first and the quantity after it', () => {
    setup()
    expect(document.querySelector('.list-row__meta')).toHaveTextContent('Went off 37 days ago · 500 g')
  })
  it('Throw out is the danger secondary and Keep the secondary, named after the Ingredient', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Throw out flour' })).toHaveAttribute('data-variant', 'danger-secondary')
    expect(screen.getByRole('button', { name: 'Keep flour' })).toHaveAttribute('data-variant', 'secondary')
  })
})

describe('SpoiledTile focus after a row leaves (A11Y, SSP-17)', () => {
  const lots = [makeLot({ id: 1, ingredientName: 'flour' }), makeLot({ id: 2, ingredientName: 'milk', baseUnit: 'ml' }), makeLot({ id: 3, ingredientName: 'carrot' })]
  const tile = (list: typeof lots) => <SpoiledTile today={today} lots={list} onThrowOut={() => {}} onKeep={() => {}} />
  it('after Keep removes a row, focus moves to the next row\'s Keep', async () => {
    const { rerender } = render(tile(lots))
    await userEvent.click(screen.getByRole('button', { name: 'Keep flour' }))
    rerender(tile(lots.slice(1)))
    expect(screen.getByRole('button', { name: 'Keep milk' })).toHaveFocus()
  })
  it('after the last row goes, focus goes to the previous row\'s Keep', async () => {
    const { rerender } = render(tile(lots))
    await userEvent.click(screen.getByRole('button', { name: 'Keep carrot' }))
    rerender(tile(lots.slice(0, 2)))
    expect(screen.getByRole('button', { name: 'Keep milk' })).toHaveFocus()
  })
})
