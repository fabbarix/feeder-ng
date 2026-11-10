import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ShopPicker } from './ShopPicker'

const shops = [
  { id: 1, name: 'Aldi' },
  { id: 2, name: 'Coop' },
]

describe('ShopPicker', () => {
  it('puts the last used Shop first and picks it', async () => {
    const onPick = vi.fn()
    render(<ShopPicker shops={shops} lastShopId={2} onPick={onPick} onStockTake={() => {}} />)
    const buttons = screen.getAllByRole('button').map((b) => b.textContent)
    expect(buttons[0]).toContain('Coop (last used)')
    expect(buttons).toContain('Aldi')
    await userEvent.click(screen.getByRole('button', { name: 'Coop (last used)' }))
    expect(onPick).toHaveBeenCalledWith({ id: 2, name: 'Coop' })
  })

  it('lists the Shops alphabetically when none was used yet', () => {
    render(<ShopPicker shops={[...shops].reverse()} lastShopId={null} onPick={() => {}} onStockTake={() => {}} />)
    expect(screen.getAllByRole('button').map((b) => b.textContent).slice(0, 2)).toEqual(['Aldi', 'Coop'])
  })

  it('ignores a last Shop that no longer exists', () => {
    render(<ShopPicker shops={shops} lastShopId={99} onPick={() => {}} onStockTake={() => {}} />)
    expect(screen.queryByText(/last used/)).toBeNull()
  })

  it('starts a Stock-take at home', async () => {
    const onStockTake = vi.fn()
    render(<ShopPicker shops={shops} lastShopId={null} onPick={() => {}} onStockTake={onStockTake} />)
    await userEvent.click(screen.getByRole('button', { name: 'Stock-take at home' }))
    expect(onStockTake).toHaveBeenCalledTimes(1)
  })

  it('still offers the Stock-take with no Shops', () => {
    render(<ShopPicker shops={[]} lastShopId={null} onPick={() => {}} onStockTake={() => {}} />)
    expect(screen.getByText(/Admin adds Shops/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stock-take at home' })).toBeInTheDocument()
  })
})
