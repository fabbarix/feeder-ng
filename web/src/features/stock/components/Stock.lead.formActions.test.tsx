// R2-4: row leading visuals go through the shared ListRow `leading` slot (pictures later), and the sheets' save sits in FormActions (F-04).
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeTotal } from '../testData'
import { AddLotSheet } from './AddLotSheet'
import { SetTotalSheet } from './SetTotalSheet'
import { StockRow } from './StockRow'

describe('StockRow lead slot', () => {
  it('renders `lead` in the ListRow leading slot, before the title', () => {
    render(
      <ul>
        <StockRow today="2026-11-09" item={makeTotal({ name: 'feta' })} lead={<img alt="" data-testid="pic" src="x.png" />} onOpen={() => {}} />
      </ul>,
    )
    const leading = document.querySelector('.list-row__leading')
    expect(leading).not.toBeNull()
    expect(leading).toContainElement(screen.getByTestId('pic'))
  })
  it('leads with the Ingredient Thumb slot (PE), not a custom visual, without `lead`', () => {
    render(<ul><StockRow today="2026-11-09" item={makeTotal({ name: 'feta' })} onOpen={() => {}} /></ul>)
    expect(document.querySelector('.list-row__leading > .thumb')).not.toBeNull()
  })
})

describe('Stock sheets use FormActions', () => {
  it('Add a Stock Lot: Save is the primary of a FormActions row', () => {
    render(<AddLotSheet open onClose={() => {}} choices={[{ id: 7, name: 'chicken thighs', baseUnit: 'g' }]} onSubmit={() => {}} />)
    expect(screen.getByRole('button', { name: 'Save' }).closest('.form-actions__primary')).not.toBeNull()
  })
  it('Set total: Save is the primary of a FormActions row', () => {
    render(<SetTotalSheet open onClose={() => {}} name="feta" baseUnit="g" initial={0} onSubmit={() => {}} />)
    expect(screen.getByRole('button', { name: 'Save' }).closest('.form-actions__primary')).not.toBeNull()
  })
})
