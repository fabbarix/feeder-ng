// H9: a Supplies list row shows its Stock level and carries a "Use" icon button (household-items.md section 4.11). Pinned props:
//   <SupplyList supplies stock system onOpen onUse busyIds label? />
//   stock: ReadonlyMap<ingredientId, total> | null   null = not loaded yet: rows keep their old meta ("piece · restocks below 6
//                                                    pieces") and every Use is disabled. A Supply missing from a loaded map has 0.
//   The row's meta is stockLevel(...).text; below the level it takes the info tone (the meta's data-status="info", with its icon).
//   The Use button is an IconButton (icon "use"), named useLabel(...), in the row's trailing slot, beside the chevron: tapping it
//   calls onUse(supply) and never opens the row. Disabled when there is no Stock or while that Supply is busy.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { dishSoapJSON, toiletPaperJSON } from '../supply.test-helper'
import type { Ingredient } from '../types'
import { SupplyList } from './SupplyList'

const batteries: Ingredient = { ...toiletPaperJSON, id: 23, name: 'batteries', conversions: [], restockLevel: null }
const row = (name: string) => screen.getByRole('button', { name }).closest('li') as HTMLElement
const stock = (entries: Array<[number, number]>) => new Map(entries)

function setup(map: ReadonlyMap<number, number> | null, extra: Partial<React.ComponentProps<typeof SupplyList>> = {}) {
  const onOpen = vi.fn()
  const onUse = vi.fn()
  render(<SupplyList supplies={[toiletPaperJSON, dishSoapJSON, batteries]} stock={map} system="metric" onOpen={onOpen} onUse={onUse} {...extra} />)
  return { onOpen, onUse }
}

describe('SupplyList: the stock level', () => {
  it('shows the Stock and the Restock level on each row', () => {
    setup(stock([[22, 9], [21, 800], [23, 12]]))
    expect(row('Toilet paper')).toHaveTextContent('9 pieces · restocks below 6')
    expect(row('Dish soap')).toHaveTextContent('800 ml · restocks below 500 ml')
    expect(row('Batteries')).toHaveTextContent('12 pieces')
    expect(row('Batteries')).not.toHaveTextContent(/restock/i)
  })
  it('marks a Supply below its Restock level with the info tone and the words "below Restock level"', () => {
    setup(stock([[22, 4], [21, 800]]))
    const meta = row('Toilet paper').querySelector('.list-row__meta')
    expect(meta).toHaveTextContent('4 pieces · below Restock level 6')
    expect(meta).toHaveAttribute('data-status', 'info')
    expect(row('Dish soap').querySelector('.list-row__meta')).not.toHaveAttribute('data-status')
  })
  it('reads "None in Stock" for a Supply with no Stock (missing from the loaded totals)', () => {
    setup(stock([[22, 4]]))
    expect(row('Dish soap')).toHaveTextContent('None in Stock')
    expect(row('Dish soap').querySelector('.list-row__meta')).toHaveAttribute('data-status', 'info') // it has a Restock level
    expect(row('Batteries')).toHaveTextContent('None in Stock')
    expect(row('Batteries').querySelector('.list-row__meta')).not.toHaveAttribute('data-status') // no level, nothing to restock
  })
  it('keeps the old row meta until Stock has loaded', () => {
    setup(null)
    expect(row('Toilet paper')).toHaveTextContent('piece · restocks below 6 pieces')
    expect(row('Dish soap')).toHaveTextContent('ml · restocks below 500 ml')
  })
  it('is a list named like the screen, one row per Supply, and a row still opens its page', async () => {
    const { onOpen } = setup(stock([[22, 4]]), { label: 'Supplies' })
    expect(within(screen.getByRole('list', { name: 'Supplies' })).getAllByRole('listitem')).toHaveLength(3)
    await userEvent.click(screen.getByRole('button', { name: 'Dish soap' }))
    expect(onOpen).toHaveBeenCalledWith(21)
  })
})

describe('SupplyList: the Use button', () => {
  it('is a button named after the Supply: "Use one" for pieces, "Use some" for g and ml', () => {
    setup(stock([[22, 4], [21, 800], [23, 2]]))
    expect(screen.getByRole('button', { name: 'Use one Toilet paper' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Use some Dish soap' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Use one Batteries' })).toBeEnabled()
  })
  it('sits in its own row, beside the row target, and shows only an icon (no visible text)', () => {
    setup(stock([[22, 4]]))
    const use = screen.getByRole('button', { name: 'Use one Toilet paper' })
    expect(row('Toilet paper')).toContainElement(use)
    expect(use).toHaveClass('icon-button')
    expect(use.textContent).toBe('')
    expect(use.querySelector('svg')).not.toBeNull()
  })
  it('calls onUse with the Supply, and does not open the row', async () => {
    const { onUse, onOpen } = setup(stock([[22, 4], [21, 800]]))
    await userEvent.click(screen.getByRole('button', { name: 'Use some Dish soap' }))
    expect(onUse).toHaveBeenCalledTimes(1)
    expect(onUse).toHaveBeenCalledWith(dishSoapJSON)
    expect(onOpen).not.toHaveBeenCalled()
  })
  it('is disabled for a Supply with no Stock', () => {
    setup(stock([[22, 4]]))
    expect(screen.getByRole('button', { name: 'Use some Dish soap' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Use one Batteries' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Use one Toilet paper' })).toBeEnabled()
  })
  it('is disabled for every Supply until Stock has loaded', () => {
    setup(null)
    for (const name of ['Use one Toilet paper', 'Use some Dish soap', 'Use one Batteries']) expect(screen.getByRole('button', { name })).toBeDisabled()
  })
  it('is disabled for the Supplies that are busy, and only for them', () => {
    setup(stock([[22, 4], [21, 800]]), { busyIds: new Set([22]) })
    expect(screen.getByRole('button', { name: 'Use one Toilet paper' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Use some Dish soap' })).toBeEnabled()
  })
  it('does not call onUse when disabled', async () => {
    const { onUse } = setup(stock([]))
    await userEvent.click(screen.getByRole('button', { name: 'Use one Toilet paper' }))
    expect(onUse).not.toHaveBeenCalled()
  })
})
