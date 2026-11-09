import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'
import { buildRoutes, type FeatureModule } from './features'
import type { NavItem } from './nav'

function setup(opts: { path?: string; onSignOut?: () => void; navItems?: NavItem[]; mods?: Record<string, FeatureModule> } = {}) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <AppShell
            user={{ displayName: 'Anna Rossi' }}
            onSignOut={opts.onSignOut ?? (() => {})}
            navItems={opts.navItems}
          />
        ),
        children: buildRoutes(opts.mods ?? {}),
      },
    ],
    { initialEntries: [opts.path ?? '/'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const labels = (nav: HTMLElement) => within(nav).getAllByRole('link').map((a) => a.textContent?.trim())

describe('AppShell navigation', () => {
  it('phone bottom bar: Today, Plan, Scan, Shop, Recipes in that order', () => {
    setup()
    expect(labels(screen.getByRole('navigation', { name: 'Bottom bar' }))).toEqual(['Today', 'Plan', 'Scan', 'Shop', 'Recipes'])
  })

  it('desktop side rail lists the same destinations', () => {
    setup()
    expect(labels(screen.getByRole('navigation', { name: 'Side rail' }))).toEqual(['Today', 'Plan', 'Scan', 'Shop', 'Recipes'])
  })

  it('raises the Scan button in the centre of the bottom bar only', () => {
    setup()
    const bar = screen.getByRole('navigation', { name: 'Bottom bar' })
    expect(within(bar).getByRole('link', { name: 'Scan' })).toHaveAttribute('data-raised', 'true')
    expect(within(bar).getByRole('link', { name: 'Plan' })).not.toHaveAttribute('data-raised')
    const rail = screen.getByRole('navigation', { name: 'Side rail' })
    expect(within(rail).getByRole('link', { name: 'Scan' })).not.toHaveAttribute('data-raised', 'true')
  })

  it('marks the current destination with aria-current and navigates on click', async () => {
    setup({ path: '/plan' })
    const bar = screen.getByRole('navigation', { name: 'Bottom bar' })
    expect(within(bar).getByRole('link', { name: 'Plan' })).toHaveAttribute('aria-current', 'page')
    expect(within(bar).getByRole('link', { name: 'Today' })).not.toHaveAttribute('aria-current')
    await userEvent.click(within(bar).getByRole('link', { name: 'Recipes' }))
    expect(within(bar).getByRole('link', { name: 'Recipes' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: 'Recipes' })).toBeInTheDocument()
  })

  it('renders the routed page inside the shell', () => {
    setup({ path: '/shop' })
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('heading', { name: 'Shop' }))
  })

  it('renders feature routes in the outlet', () => {
    setup({
      path: '/plan',
      mods: { '../features/plan/index.ts': { routes: [{ path: '/plan', element: <p>week grid</p> }] } },
    })
    expect(screen.getByRole('main')).toHaveTextContent('week grid')
  })
})

describe('avatar menu', () => {
  it('is closed at first and opens from the avatar button', async () => {
    setup()
    expect(screen.queryByRole('menu')).toBeNull()
    const btn = screen.getByRole('button', { name: 'Account menu' })
    expect(btn).toHaveAttribute('aria-haspopup', 'menu')
    await userEvent.click(btn)
    const menu = screen.getByRole('menu')
    const items = within(menu).getAllByRole('menuitem').map((i) => i.textContent?.trim())
    expect(items).toEqual(['Stock', 'Settings', 'Sign out'])
  })

  it('links Stock and Settings to their pages', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(screen.getByRole('menuitem', { name: 'Stock' })).toHaveAttribute('href', '/stock')
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toHaveAttribute('href', '/settings')
  })

  it('adds feature menu items between Settings and Sign out, by order', async () => {
    setup({
      navItems: [
        { id: 'b', label: 'Weight Barcode Rules', path: '/settings/barcodes', placement: 'menu', order: 2 },
        { id: 'a', label: 'Household', path: '/settings/household', placement: 'menu', order: 1 },
      ],
    })
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem').map((i) => i.textContent?.trim())
    expect(items).toEqual(['Stock', 'Settings', 'Household', 'Weight Barcode Rules', 'Sign out'])
  })

  it('Sign out calls onSignOut', async () => {
    const onSignOut = vi.fn()
    setup({ onSignOut })
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(onSignOut).toHaveBeenCalledOnce()
  })

  it('closes on Escape', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('shows the User as an Avatar', () => {
    setup()
    expect(within(screen.getByRole('button', { name: 'Account menu' })).getByLabelText('Anna Rossi')).toHaveTextContent('AR')
  })
})
