import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ShopPicker } from './ShopPicker'

const shops = [
  { id: 1, name: 'Aldi' },
  { id: 2, name: 'Coop' },
]

const rows = () => within(screen.getByRole('list', { name: 'Shops' })).getAllByRole('listitem')

describe('ShopPicker (ListRows, ui-fix-plan 5.6)', () => {
  it('puts the last used Shop first, marked with a check and "Last used", and picks it', async () => {
    const onPick = vi.fn()
    render(<ShopPicker shops={shops} lastShopId={2} onPick={onPick} onStockTake={() => {}} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Where are you shopping?' })).toBeInTheDocument()
    expect(rows()[0]).toHaveTextContent('Coop')
    expect(rows()[0]).toHaveTextContent('Last used')
    expect(rows()[0]).toHaveAttribute('data-selected', 'true')
    expect(within(rows()[0]!).getByRole('button', { name: 'Coop' })).toHaveAttribute('aria-current', 'true')
    expect(rows()[1]).not.toHaveAttribute('data-selected')
    expect(rows()[1]).toHaveTextContent('Aldi')
    await userEvent.click(within(rows()[0]!).getByRole('button'))
    expect(onPick).toHaveBeenCalledWith({ id: 2, name: 'Coop' })
  })

  it('lists the Shops alphabetically when none was used yet, with a storefront icon each', () => {
    render(<ShopPicker shops={[...shops].reverse()} lastShopId={null} onPick={() => {}} onStockTake={() => {}} />)
    expect(rows().slice(0, 2).map((r) => r.textContent)).toEqual([expect.stringContaining('Aldi'), expect.stringContaining('Coop')])
    expect(rows()[0]!.querySelector('svg')).not.toBeNull()
  })

  it('ignores a last Shop that no longer exists', () => {
    render(<ShopPicker shops={shops} lastShopId={99} onPick={() => {}} onStockTake={() => {}} />)
    expect(screen.queryByText('Last used')).toBeNull()
  })

  it('"Stock-take at home" is the final row', async () => {
    const onStockTake = vi.fn()
    render(<ShopPicker shops={shops} lastShopId={null} onPick={() => {}} onStockTake={onStockTake} />)
    const last = rows()[rows().length - 1]!
    expect(last).toHaveTextContent('Stock-take at home')
    await userEvent.click(within(last).getByRole('button'))
    expect(onStockTake).toHaveBeenCalledTimes(1)
  })

  it('still offers the Stock-take with no Shops, and says where Shops come from', () => {
    render(<ShopPicker shops={[]} lastShopId={null} onPick={() => {}} onStockTake={() => {}} />)
    expect(screen.getByText(/Add the Shop you are in/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Stock-take at home/ })).toBeInTheDocument()
  })

  it('has no Tile-as-button and no Button of its own (rows are the targets)', () => {
    const { container } = render(<ShopPicker shops={shops} lastShopId={2} onPick={() => {}} onStockTake={() => {}} />)
    expect(container.querySelector('.tile[role=button]')).toBeNull()
  })
})

describe('ShopPicker: Shop Location', () => {
  const idle = { nearest: null, status: 'idle' as const, failure: null, anyLocated: true, onFind: () => {} }

  it('puts the Shop the User is in first, marked "You are here", ahead of the last used', () => {
    render(<ShopPicker shops={shops} lastShopId={2} onPick={() => {}} onStockTake={() => {}} nearby={{ ...idle, status: 'ready', nearest: { id: 1, distance: '40 m' } }} />)
    expect(rows()[0]).toHaveTextContent('Aldi')
    expect(rows()[0]).toHaveTextContent('You are here · 40 m')
    expect(rows()[0]).toHaveAttribute('data-selected', 'true')
    expect(rows()[1]).toHaveTextContent('Last used')
    expect(screen.queryByText('Find the Shop I am in')).toBeNull()
  })

  it('offers "Find the Shop I am in" when some Shop has a location, and reports what it found', async () => {
    const onFind = vi.fn()
    const { rerender } = render(<ShopPicker shops={shops} lastShopId={null} onPick={() => {}} onStockTake={() => {}} nearby={{ ...idle, onFind }} />)
    await userEvent.click(screen.getByRole('button', { name: /Find the Shop I am in/ }))
    expect(onFind).toHaveBeenCalled()
    rerender(<ShopPicker shops={shops} lastShopId={null} onPick={() => {}} onStockTake={() => {}} nearby={{ ...idle, status: 'ready' }} />)
    expect(screen.getByText('No saved Shop is near you')).toBeInTheDocument()
    rerender(<ShopPicker shops={shops} lastShopId={null} onPick={() => {}} onStockTake={() => {}} nearby={{ ...idle, status: 'failed', failure: 'denied' }} />)
    expect(screen.getByText('Location is off for Feeder')).toBeInTheDocument()
  })

  it('hides "Find" while no Shop has a location', () => {
    render(<ShopPicker shops={shops} lastShopId={null} onPick={() => {}} onStockTake={() => {}} nearby={{ ...idle, anyLocated: false }} />)
    expect(screen.queryByText('Find the Shop I am in')).toBeNull()
  })

  it('lets any User add the Shop they are in, before the Stock-take row', async () => {
    const onAddShop = vi.fn()
    render(<ShopPicker shops={[]} lastShopId={null} onPick={() => {}} onStockTake={() => {}} onAddShop={onAddShop} />)
    const all = rows()
    expect(all[all.length - 2]).toHaveTextContent('Add the Shop I am in')
    await userEvent.click(within(all[all.length - 2]!).getByRole('button'))
    expect(onAddShop).toHaveBeenCalled()
  })
})
