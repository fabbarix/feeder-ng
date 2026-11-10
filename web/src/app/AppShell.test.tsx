import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'
import { buildRoutes, type FeatureModule } from './features'
import type { NavItem } from './nav'

// Icon calls are recorded as data attributes so the tests can assert name, size and weight (the `fill` weight of the active tab).
vi.mock('../ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ui')>()),
  Icon: (p: { name: string; size?: number; weight?: string }) => (
    <i data-testid="icon" data-name={p.name} data-size={p.size} data-weight={p.weight ?? 'default'} />
  ),
}))
// ShellStatus owns the only import of WP4's OfflineBanner; it is covered in ShellStatus.test.tsx.
vi.mock('./ShellStatus', () => ({
  ShellStatus: (p: { pendingScans?: number }) => <div data-testid="shell-status" data-pending={p.pendingScans} />,
}))

function setup(opts: { path?: string; onSignOut?: () => void; navItems?: NavItem[]; pendingScans?: number; mods?: Record<string, FeatureModule> } = {}) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <AppShell
            user={{ displayName: 'Anna Rossi' }}
            onSignOut={opts.onSignOut ?? (() => {})}
            navItems={opts.navItems}
            pendingScans={opts.pendingScans}
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

const bottomBar = () => screen.getByRole('navigation', { name: 'Bottom bar' })
const sideRail = () => screen.getByRole('navigation', { name: 'Side rail' })
const labels = (nav: HTMLElement) => within(nav).getAllByRole('link').map((a) => a.textContent?.trim())
const iconOf = (link: HTMLElement) => {
  const icon = within(link).getByTestId('icon')
  return { name: icon.dataset.name, size: icon.dataset.size, weight: icon.dataset.weight }
}

describe('bottom bar (phone)', () => {
  it('lists Today, Plan, Scan, Shop, Recipes in that order', () => {
    setup()
    expect(labels(bottomBar())).toEqual(['Today', 'Plan', 'Scan', 'Shop', 'Recipes'])
  })

  it('shows the registered icon of each destination at 24 px (Scan 28 px)', () => {
    setup({ path: '/stock' }) // no tab active
    const bar = bottomBar()
    for (const [label, name, size] of [
      ['Today', 'today', '24'],
      ['Plan', 'plan', '24'],
      ['Scan', 'scan', '28'],
      ['Shop', 'shop', '24'],
      ['Recipes', 'recipes', '24'],
    ] as const) {
      expect(iconOf(within(bar).getByRole('link', { name: label })), label).toMatchObject({ name, size })
    }
  })

  it('marks only the current tab with aria-current and gives it the fill icon weight', () => {
    setup({ path: '/plan' })
    const bar = bottomBar()
    const plan = within(bar).getByRole('link', { name: 'Plan' })
    expect(plan).toHaveAttribute('aria-current', 'page')
    expect(iconOf(plan).weight).toBe('fill')
    for (const other of ['Today', 'Scan', 'Shop', 'Recipes']) {
      const link = within(bar).getByRole('link', { name: other })
      expect(link, other).not.toHaveAttribute('aria-current')
      expect(iconOf(link).weight, other).toBe('regular')
    }
  })

  it('moves aria-current and the fill icon when navigating', async () => {
    setup({ path: '/plan' })
    await userEvent.click(within(bottomBar()).getByRole('link', { name: 'Recipes' }))
    const recipes = within(bottomBar()).getByRole('link', { name: 'Recipes' })
    expect(recipes).toHaveAttribute('aria-current', 'page')
    expect(iconOf(recipes).weight).toBe('fill')
    expect(iconOf(within(bottomBar()).getByRole('link', { name: 'Plan' })).weight).toBe('regular')
    expect(screen.getByRole('heading', { name: 'Recipes' })).toBeInTheDocument()
  })

  it('Today is current on "/" only', () => {
    setup({ path: '/' })
    expect(within(bottomBar()).getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page')
  })

  it('Scan is the accent button, not raised; no other tab is accent', () => {
    setup()
    const bar = bottomBar()
    const scan = within(bar).getByRole('link', { name: 'Scan' })
    expect(scan).toHaveAttribute('data-accent', 'true')
    expect(scan).not.toHaveAttribute('data-raised')
    for (const other of ['Today', 'Plan', 'Shop', 'Recipes']) {
      expect(within(bar).getByRole('link', { name: other })).not.toHaveAttribute('data-accent')
    }
  })

  it('shows the label as a separate element under the icon', () => {
    setup()
    const link = within(bottomBar()).getByRole('link', { name: 'Shop' })
    expect(link.querySelector('.bottom-bar__label')).toHaveTextContent('Shop')
  })
})

describe('side rail (tablet landscape / desktop)', () => {
  it('lists the same order as the bottom bar (R11a N8): Today first, then Plan, Scan (accent), Shop, Recipes', () => {
    setup()
    const rail = sideRail()
    expect(labels(rail)).toEqual(['Today', 'Plan', 'Scan', 'Shop', 'Recipes'])
    expect(within(rail).getByRole('link', { name: 'Scan' })).toHaveAttribute('data-accent', 'true')
  })

  it('uses 24 px icons and stacks the label as its own element', () => {
    setup({ path: '/stock' })
    const rail = sideRail()
    for (const [label, name] of [
      ['Today', 'today'],
      ['Plan', 'plan'],
      ['Shop', 'shop'],
      ['Recipes', 'recipes'],
      ['Scan', 'scan'],
    ] as const) {
      const link = within(rail).getByRole('link', { name: label })
      expect(iconOf(link), label).toMatchObject({ name, size: '24' })
      expect(link.querySelector('.side-rail__label'), label).toHaveTextContent(label)
    }
  })

  it('marks the current destination with aria-current and the fill icon', () => {
    setup({ path: '/shop' })
    const shop = within(sideRail()).getByRole('link', { name: 'Shop' })
    expect(shop).toHaveAttribute('aria-current', 'page')
    expect(iconOf(shop).weight).toBe('fill')
    expect(iconOf(within(sideRail()).getByRole('link', { name: 'Today' })).weight).toBe('regular')
  })
})

describe('page and status slot', () => {
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

  it('renders the status slot (OfflineBanner) once, between the top bar and the page, with the pending Scan count', () => {
    setup({ pendingScans: 3 })
    const slot = screen.getByTestId('shell-status')
    expect(screen.getAllByTestId('shell-status')).toHaveLength(1)
    expect(slot).toHaveAttribute('data-pending', '3')
    const header = screen.getByRole('banner')
    const main = screen.getByRole('main')
    expect(header.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(slot.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(main).not.toContainElement(slot)
  })
})

describe('avatar menu', () => {
  const open = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Your menu' }))
    return screen.getByRole('menu')
  }
  const texts = (menu: HTMLElement) => within(menu).getAllByRole('menuitem').map((i) => i.textContent?.trim())

  it('is closed at first and opens from the avatar button', async () => {
    setup()
    expect(screen.queryByRole('menu')).toBeNull()
    const btn = screen.getByRole('button', { name: 'Your menu' })
    expect(btn).toHaveAttribute('aria-haspopup', 'menu')
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    const menu = await open()
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    expect(texts(menu)).toEqual(['Stock', 'Kitchen board', 'Settings', 'Sign out'])
  })

  it('links Stock, Kitchen board and Settings to their pages', async () => {
    setup()
    await open()
    expect(screen.getByRole('menuitem', { name: 'Stock' })).toHaveAttribute('href', '/stock')
    expect(screen.getByRole('menuitem', { name: 'Kitchen board' })).toHaveAttribute('href', '/board')
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toHaveAttribute('href', '/settings')
  })

  it('gives every row an icon: Stock, Kitchen board (board), Settings, Sign out', async () => {
    setup()
    const menu = await open()
    for (const [label, name] of [
      ['Stock', 'stock'],
      ['Kitchen board', 'board'],
      ['Settings', 'settings'],
      ['Sign out', 'signOut'],
    ] as const) {
      expect(iconOf(within(menu).getByRole('menuitem', { name: label })), label).toMatchObject({ name, size: '20' })
    }
  })

  it('puts one divider before Settings (between the shortcuts and the account group)', async () => {
    setup()
    const menu = await open()
    const separators = within(menu).getAllByRole('separator')
    expect(separators).toHaveLength(1)
    const settings = within(menu).getByRole('menuitem', { name: 'Settings' })
    const board = within(menu).getByRole('menuitem', { name: 'Kitchen board' })
    expect(board.compareDocumentPosition(separators[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(separators[0]!.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('adds feature menu items between Settings and Sign out, by order, with their icon (default chevron)', async () => {
    setup({
      navItems: [
        { id: 'b', label: 'Weight Barcode Rules', path: '/settings/barcodes', icon: 'barcodes', placement: 'menu', order: 2 },
        { id: 'a', label: 'Household', path: '/settings/household', placement: 'menu', order: 1 },
      ],
    })
    const menu = await open()
    expect(texts(menu)).toEqual(['Stock', 'Kitchen board', 'Settings', 'Household', 'Weight Barcode Rules', 'Sign out'])
    expect(iconOf(within(menu).getByRole('menuitem', { name: 'Weight Barcode Rules' })).name).toBe('barcodes')
    expect(iconOf(within(menu).getByRole('menuitem', { name: 'Household' })).name).toBe('chevron')
  })

  it('Sign out is last, in the danger tone, and calls onSignOut then closes', async () => {
    const onSignOut = vi.fn()
    setup({ onSignOut })
    const menu = await open()
    const items = within(menu).getAllByRole('menuitem')
    const signOut = items[items.length - 1]!
    expect(signOut).toHaveTextContent('Sign out')
    expect(signOut).toHaveAttribute('data-tone', 'danger')
    expect(within(menu).getByRole('menuitem', { name: 'Stock' })).not.toHaveAttribute('data-tone')
    await userEvent.click(signOut)
    expect(onSignOut).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('moves focus to the first item on open (not Sign out), and nothing is highlighted as selected', async () => {
    setup()
    const menu = await open()
    expect(within(menu).getByRole('menuitem', { name: 'Stock' })).toHaveFocus()
    for (const item of within(menu).getAllByRole('menuitem')) expect(item).not.toHaveAttribute('aria-current')
  })

  it('arrow keys move between items, Home and End jump, wrapping at the ends', async () => {
    setup()
    const menu = await open()
    await userEvent.keyboard('{ArrowDown}')
    expect(within(menu).getByRole('menuitem', { name: 'Kitchen board' })).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(within(menu).getByRole('menuitem', { name: 'Sign out' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(within(menu).getByRole('menuitem', { name: 'Stock' })).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}')
    expect(within(menu).getByRole('menuitem', { name: 'Sign out' })).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(within(menu).getByRole('menuitem', { name: 'Stock' })).toHaveFocus()
  })

  it('closes on Escape and returns focus to the avatar button', async () => {
    setup()
    await open()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('button', { name: 'Your menu' })).toHaveFocus()
  })

  it('closes on Tab (focus leaves the menu, the menu does not stay open behind it)', async () => {
    setup()
    await open()
    await userEvent.tab()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('has a scrim: a click outside the menu closes it (the menu no longer floats over content unannounced)', async () => {
    setup()
    await open()
    await userEvent.click(screen.getByTestId('menu-scrim'))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes after following a link', async () => {
    setup()
    await open()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Settings' }))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
  })

  it('shows the User as an Avatar', () => {
    setup()
    expect(within(screen.getByRole('button', { name: 'Your menu' })).getByLabelText('Anna Rossi')).toHaveTextContent('AR')
  })
})

describe('side rail pill (88 px rail)', () => {
  it('wraps each rail icon in a .side-rail__pill span, so the active pill sits behind the icon', () => {
    setup()
    const links = within(sideRail()).getAllByRole('link')
    for (const link of links) {
      const pill = link.querySelector('span.side-rail__pill')
      expect(pill, link.textContent ?? '').not.toBeNull()
      expect(pill!.querySelector('[data-testid="icon"]')).not.toBeNull()
      expect(link.querySelector('.side-rail__label')).not.toBeNull()
    }
  })
})
