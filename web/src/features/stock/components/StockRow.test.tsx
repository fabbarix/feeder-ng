import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeTotal } from '../testData'
import { StockRow } from './StockRow'

const today = '2026-11-09'
const inList = (ui: React.ReactElement) => render(<ul>{ui}</ul>)

describe('StockRow', () => {
  it('is a list row: name, total and lot count as separate texts, never run together', () => {
    inList(<StockRow today={today} item={makeTotal({ name: 'feta', total: 200, lotCount: 1 })} onOpen={() => {}} />)
    const row = screen.getByRole('listitem')
    expect(within(row).getByText('Feta')).toBeInTheDocument()
    expect(within(row).getByText('200 g')).toBeInTheDocument()
    expect(within(row).getByText('1 Stock Lot')).toBeInTheDocument()
    expect(row).not.toHaveTextContent('Feta200')
  })

  it('shows the last good day of a use-soon Ingredient, without a Use soon pill', () => {
    inList(<StockRow today={today} item={makeTotal({ lotCount: 1, useSoon: true, nextGoesOff: '2026-11-12' })} onOpen={() => {}} />)
    expect(screen.getByText('1 Stock Lot · good until Thu')).toBeInTheDocument()
    expect(screen.queryByText('Use soon')).toBeNull()
    expect(document.querySelector('.chip')).toBeNull()
  })

  it('capitalises the name for display only', () => {
    inList(<StockRow today={today} item={makeTotal({ name: 'chicken thighs' })} onOpen={() => {}} />)
    expect(document.querySelector('.list-row__title')).toHaveTextContent(/^Chicken thighs$/)
  })

  it('separates the meta with a single space on each side of the dot', () => {
    inList(<StockRow today={today} item={makeTotal({ lotCount: 1, useSoon: true, nextGoesOff: '2026-11-12' })} onOpen={() => {}} />)
    expect(document.querySelector('.list-row__meta')?.textContent).toBe('1 Stock Lot · good until Thu')
    expect(document.querySelector('.list-row__meta')?.textContent).not.toMatch(/\s{2,}/)
  })

  it('is not a Tile and has no tone', () => {
    inList(<StockRow today={today} item={makeTotal({ useSoon: true })} onOpen={() => {}} />)
    expect(document.querySelector('.tile, [data-tone]')).toBeNull()
  })

  it('converts the total to the unit system', () => {
    inList(<StockRow today={today} system="imperial" item={makeTotal({ total: 454, baseUnit: 'g' })} onOpen={() => {}} />)
    expect(screen.queryByText('454 g')).toBeNull()
  })

  it('opens the Ingredient', async () => {
    const onOpen = vi.fn()
    inList(<StockRow today={today} item={makeTotal({ ingredientId: 9, name: 'milk' })} onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('button', { name: 'Milk' }))
    expect(onOpen).toHaveBeenCalledWith(9)
  })
})
