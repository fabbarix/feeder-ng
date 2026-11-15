// B9-30 (SET-14b, SAFE-04): the Shops list rows carry a meta line ("12 Prices · Location saved"), Add Shop explains instead of being
// disabled, and a form's own failure is a FormError.
// API pinned:
//   ShopList rows: ListRow title = name, meta = shopMeta(shop) (lib/shopMeta), the pin icon stays for a saved Location (metaIcon 'location').
//   AddShopSheet: "Add Shop" is never disabled for want of a name; Save with no name marks Shop name aria-invalid, focuses it and says
//     "Enter a name for the Shop." under it (no role=alert for that); a server failure is a FormError.
//   ShopNameForm (Rename): the same for its own failure (FormError, role=alert, class form-error), not `.pg__error`.
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithProviders } from '../../settings/test-utils'
import { AddShopSheet } from './AddShopSheet'
import { ShopList, ShopNameForm } from './ShopList'

afterEach(() => vi.unstubAllGlobals())

describe('ShopList rows (SET-14b)', () => {
  it('every row has a meta line with its Price count and Location', () => {
    renderWithProviders(
      <ShopList
        shops={[
          { id: 1, name: 'Coop', priceCount: 12, location: { lat: 45, lon: 9 } },
          { id: 2, name: 'Aldi', priceCount: 0, location: null },
          { id: 3, name: 'Lidl', priceCount: 1, location: null },
        ]}
      />,
    )
    const row = (name: string) => screen.getByRole('link', { name: new RegExp(name) }).closest('li')!
    expect(row('Coop').querySelector('.list-row__meta')).toHaveTextContent('12 Prices · Location saved')
    expect(row('Aldi').querySelector('.list-row__meta')).toHaveTextContent('No Prices yet · Location not saved')
    expect(row('Lidl').querySelector('.list-row__meta')).toHaveTextContent('1 Price · Location not saved')
  })

  it('"Add Shop" is an outline button', () => {
    renderWithProviders(<ShopList shops={[]} />)
    expect(screen.getByRole('button', { name: 'Add Shop' })).toHaveAttribute('data-variant', 'secondary')
  })
})

describe('AddShopSheet (SAFE-04)', () => {
  const open = () => {
    const api = mockApi({ 'GET /api/shops': [] })
    renderWithProviders(<AddShopSheet open onClose={() => {}} onAdded={() => {}} />)
    return api
  }

  it('its Save is not disabled for an empty name; pressing it explains at the field and focuses it', async () => {
    const api = open()
    const save = await screen.findByRole('button', { name: 'Add Shop' })
    expect(save).toBeEnabled()
    await userEvent.click(save)
    const field = screen.getByLabelText('Shop name')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(field).toHaveFocus())
    expect(screen.getByText('Enter a name for the Shop.')).toBeInTheDocument()
    expect(document.querySelector('.form-error')).toBeNull()
    expect(api.callsTo('POST', '/api/shops')).toHaveLength(0)
  })

  it('the error clears when the name is typed', async () => {
    open()
    await userEvent.click(await screen.findByRole('button', { name: 'Add Shop' }))
    await userEvent.type(screen.getByLabelText('Shop name'), 'C')
    expect(screen.queryByText('Enter a name for the Shop.')).toBeNull()
    expect(screen.getByLabelText('Shop name')).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('a server failure is a FormError, not a loose paragraph', async () => {
    mockApi({ 'GET /api/shops': [], 'POST /api/shops': { status: 409, json: { error: { code: 'duplicate', message: 'There is already a Shop called Coop.' } } } })
    renderWithProviders(<AddShopSheet open onClose={() => {}} onAdded={() => {}} />)
    await userEvent.type(await screen.findByLabelText('Shop name'), 'Coop')
    await userEvent.click(screen.getByRole('button', { name: 'Add Shop' }))
    const alert = (await screen.findByText('There is already a Shop called Coop.')).closest('[role="alert"]')
    expect(alert).toHaveClass('form-error')
    expect(document.querySelector('.pg__error')).toBeNull()
  })
})

describe('ShopNameForm (Rename)', () => {
  it('a rejected rename is a FormError', async () => {
    renderWithProviders(<ShopNameForm initial="Coop" submitLabel="Save Shop" onSubmit={() => Promise.reject(new Error('That name is taken.'))} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save Shop' }))
    const alert = (await screen.findByText('That name is taken.')).closest('[role="alert"]')
    expect(alert).toHaveClass('form-error')
  })

  it('clearing the name and saving explains at the field', async () => {
    renderWithProviders(<ShopNameForm initial="Coop" submitLabel="Save Shop" onSubmit={() => Promise.resolve()} />)
    await userEvent.clear(screen.getByLabelText('Shop name'))
    await userEvent.click(screen.getByRole('button', { name: 'Save Shop' }))
    expect(screen.getByLabelText('Shop name')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Enter a name for the Shop.')).toBeInTheDocument()
  })
})
