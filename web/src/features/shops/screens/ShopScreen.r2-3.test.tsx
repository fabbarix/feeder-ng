// R2-3 (S-04, F-04): the Shop's entity actions leave the loose text row under the title and go to the PageHeader actions as
// IconButtons ("Rename Shop", "Delete Shop"); only an Admin sees them. Delete keeps its confirm sheet. ("Add Shop Barcode" stays a
// list-level action under the list.)
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ADMIN_ME, USER_ME, mockApi, renderWithProviders } from '../../settings/test-utils'
import { ShopScreen } from './ShopScreen'

afterEach(() => vi.unstubAllGlobals())

function setup(me = ADMIN_ME) {
  mockApi({ 'GET /api/me': me, 'GET /api/shops': [{ id: 4, name: 'Coop' }], 'GET /api/shops/4/weight-rules': [], 'GET /api/shops/4/barcodes': [], 'GET /api/household/settings': { currency: 'USD' } })
  return renderWithProviders(
    <Routes>
      <Route path="/settings/shops/:id" element={<ShopScreen />} />
    </Routes>,
    '/settings/shops/4',
  )
}

describe('ShopScreen entity actions (S-04)', () => {
  it('an Admin gets Rename Shop and Delete Shop as IconButtons in the PageHeader', async () => {
    setup()
    const header = (await screen.findByRole('heading', { level: 1, name: 'Coop' })).closest('header')!
    for (const name of ['Rename Shop', 'Delete Shop']) {
      const button = within(header).getByRole('button', { name })
      expect(button).toHaveClass('icon-button')
      expect(button.closest('.page-header__actions')).not.toBeNull()
    }
  })

  it('has no loose text actions under the title any more', async () => {
    const { container } = setup()
    await screen.findByRole('heading', { level: 1, name: 'Coop' })
    expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull()
    expect(container.querySelector('.pg > .pg__row')).toBeNull()
  })

  it('Delete Shop still asks to confirm before deleting', async () => {
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Shop' }))
    expect(await screen.findByText(/Its Shop Barcodes, Weight Barcode Rules and Prices go too/)).toBeInTheDocument()
  })

  it('a plain User sees the note and no entity actions', async () => {
    setup(USER_ME)
    expect(await screen.findByText('Only an Admin can change Shops.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rename Shop' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete Shop' })).toBeNull()
  })
})
