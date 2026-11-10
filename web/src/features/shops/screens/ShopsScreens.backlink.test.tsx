// R11a N8 (send-back): the Shops pages reached from the Settings index lead their header with the shared BackLink,
// and no old inline "Back to Shops" link remains.
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ADMIN_ME, mockApi, renderWithProviders } from '../../settings/test-utils'
import { ShopScreen } from './ShopScreen'
import { ShopsScreen } from './ShopsScreen'

afterEach(() => vi.unstubAllGlobals())

const shops = [{ id: 4, name: 'Coop' }]

function expectBackLink(container: HTMLElement, name: string, href: string, label: string) {
  const back = screen.getByRole('link', { name })
  expect(back).toHaveAttribute('href', href)
  expect(back).toHaveClass('back-link')
  expect(back).toHaveTextContent(label)
  expect(container.querySelector('.page-header__leading')).toContainElement(back)
}

describe('ShopsScreen (/settings/shops)', () => {
  it('leads its h1 with the shared back control to Settings', async () => {
    mockApi({ 'GET /api/me': ADMIN_ME, 'GET /api/shops': shops })
    const { container } = renderWithProviders(<ShopsScreen />, '/settings/shops')
    expect(await screen.findByRole('heading', { level: 1, name: 'Shops' })).toBeInTheDocument()
    expectBackLink(container, 'Back to Settings', '/settings', 'Settings')
  })
})

describe('ShopScreen (/settings/shops/:id)', () => {
  function renderShop() {
    return renderWithProviders(
      <Routes>
        <Route path="/settings/shops/:id" element={<ShopScreen />} />
      </Routes>,
      '/settings/shops/4',
    )
  }

  it('leads its h1 with the shared back control to Shops, and keeps no old inline link', async () => {
    mockApi({ 'GET /api/me': ADMIN_ME, 'GET /api/shops': shops, 'GET /api/shops/4/weight-rules': [], 'GET /api/shops/4/barcodes': [] })
    const { container } = renderShop()
    expect(await screen.findByRole('heading', { level: 1, name: 'Coop' })).toBeInTheDocument()
    expectBackLink(container, 'Back to Shops', '/settings/shops', 'Shops')
    // exactly one way back, and the visible text is the destination name, not the old "Back to Shops" sentence
    expect(screen.getAllByRole('link', { name: /back to/i })).toHaveLength(1)
    expect(screen.queryByText('Back to Shops')).toBeNull()
  })

  it('a missing Shop still offers the shared back control to Shops', async () => {
    mockApi({ 'GET /api/me': ADMIN_ME, 'GET /api/shops': [], 'GET /api/shops/4/weight-rules': [], 'GET /api/shops/4/barcodes': [] })
    renderShop()
    expect(await screen.findByText('Shop not found')).toBeInTheDocument()
    const back = screen.getByRole('link', { name: 'Back to Shops' })
    expect(back).toHaveAttribute('href', '/settings/shops')
    expect(back).toHaveClass('back-link')
    expect(screen.queryByText('Back to Shops')).toBeNull()
  })
})
