// R11a: the Shops pages show Breadcrumbs (Settings > Shops, Settings > Shops > name) above the h1; no back link anywhere.
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ADMIN_ME, mockApi, renderWithProviders } from '../../settings/test-utils'
import { ShopScreen } from './ShopScreen'
import { ShopsScreen } from './ShopsScreen'

afterEach(() => vi.unstubAllGlobals())

const shops = [{ id: 4, name: 'Coop' }]
const crumbs = () => {
  const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
  return {
    nav,
    links: [...nav.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]),
    current: nav.querySelector('[aria-current="page"]')?.textContent,
  }
}

describe('ShopsScreen (/settings/shops)', () => {
  it('shows Settings > Shops above the h1', async () => {
    mockApi({ 'GET /api/me': ADMIN_ME, 'GET /api/shops': shops })
    const { container } = renderWithProviders(<ShopsScreen />, '/settings/shops')
    await screen.findByRole('heading', { level: 1, name: 'Shops' })
    const { nav, links, current } = crumbs()
    expect(links).toEqual([['Settings', '/settings']])
    expect(current).toBe('Shops')
    expect(container.querySelector('.page-header')).toContainElement(nav)
    expect(screen.queryByRole('link', { name: /^back to/i })).toBeNull()
  })
})

describe('ShopScreen (/settings/shops/:id)', () => {
  const renderShop = () =>
    renderWithProviders(
      <Routes>
        <Route path="/settings/shops/:id" element={<ShopScreen />} />
      </Routes>,
      '/settings/shops/4',
    )

  it('shows Settings > Shops > Coop (the Shop name) above the h1, and keeps no old inline link', async () => {
    mockApi({ 'GET /api/me': ADMIN_ME, 'GET /api/shops': shops, 'GET /api/shops/4/weight-rules': [], 'GET /api/shops/4/barcodes': [] })
    renderShop()
    await screen.findByRole('heading', { level: 1, name: 'Coop' })
    const { links, current } = crumbs()
    expect(links).toEqual([['Settings', '/settings'], ['Shops', '/settings/shops']])
    expect(current).toBe('Coop')
    expect(screen.queryByRole('link', { name: /^back to/i })).toBeNull()
    expect(screen.queryByText('Back to Shops')).toBeNull()
  })

  it('a missing Shop keeps the trail (current page "Shop") and has no back link, not even in the empty state', async () => {
    mockApi({ 'GET /api/me': ADMIN_ME, 'GET /api/shops': [], 'GET /api/shops/4/weight-rules': [], 'GET /api/shops/4/barcodes': [] })
    renderShop()
    expect(await screen.findByText('Shop not found')).toBeInTheDocument()
    const { links, current } = crumbs()
    expect(links).toEqual([['Settings', '/settings'], ['Shops', '/settings/shops']])
    expect(current).toBe('Shop')
    expect(screen.queryByRole('link', { name: /^back to/i })).toBeNull()
  })
})
