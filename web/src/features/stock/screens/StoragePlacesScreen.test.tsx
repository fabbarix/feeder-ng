// Pantry: any User adds, edits and deletes Storage Places on /settings/storage-places.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithProviders } from '../../settings/test-utils'
import { declarations, readUiCss } from '../../../ui/test-utils'
import { StoragePlacesScreen } from './StoragePlacesScreen'

afterEach(() => vi.unstubAllGlobals())

function setup(list: unknown[]) {
  const api = mockApi({
    'GET /api/storage-places': list,
    'POST /api/storage-places': (c: { body?: unknown }) => ({ status: 201, json: { id: 9, ...(c.body as object) } }),
    'PATCH /api/storage-places/2': (c: { body?: unknown }) => ({ json: { id: 2, ...(c.body as object) } }),
    'DELETE /api/storage-places/2': { status: 204 },
  })
  renderWithProviders(<StoragePlacesScreen />, '/settings/storage-places')
  return api
}

describe('StoragePlacesScreen', () => {
  it('lists each Storage Place with its kind, and the default', async () => {
    setup([
      { id: 1, name: 'Kitchen Pantry', kind: 'pantry', default: true },
      { id: 2, name: 'Garage Freezer', kind: 'freezer', default: false },
    ])
    const list = await screen.findByRole('list', { name: 'Storage Places' })
    expect(within(list).getByText('Pantry · Default')).toBeInTheDocument()
    expect(within(list).getByText('Freezer')).toBeInTheDocument()
  })

  it('adds a Storage Place with its kind and default flag', async () => {
    const api = setup([])
    expect(await screen.findByText('No Storage Places yet')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add Storage Place' }))
    const sheet = await screen.findByRole('dialog', { name: 'Add Storage Place' })
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Name' }), 'Garage Freezer')
    await userEvent.click(within(sheet).getByRole('button', { name: /Freezer/ }))
    expect(within(sheet).getByText(/frozen Shelf Life/)).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('switch', { name: 'Default for new Stock' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save Storage Place' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/storage-places')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/storage-places')[0]?.body).toEqual({ name: 'Garage Freezer', kind: 'freezer', default: true })
  })

  it('deletes one after a confirm that says its Stock stays', async () => {
    const api = setup([{ id: 2, name: 'Garage Freezer', kind: 'freezer', default: false }])
    await userEvent.click(await screen.findByRole('button', { name: /Garage Freezer/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Edit Storage Place' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Delete Storage Place' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete Garage Freezer?' }).catch(() => screen.findByRole('dialog', { name: 'Delete Garage Freezer?' }))
    expect(within(confirm).getByText(/stays in the Pantry, marked Not sorted/)).toBeInTheDocument()
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete Storage Place' }))
    await waitFor(() => expect(api.callsTo('DELETE', '/api/storage-places/2')).toHaveLength(1))
  })

  // IH: the intro, the list and the add action sit in the gapped ListPage list slot, so they are not glued together.
  it('puts the intro, the Storage Places list and the add action in the gapped list slot', async () => {
    setup([{ id: 1, name: 'Kitchen Pantry', kind: 'pantry', default: true }])
    const list = await screen.findByRole('list', { name: 'Storage Places' })
    const slot = list.closest('.list-page__list')!
    expect(slot).not.toBeNull()
    const kids = Array.from(slot.children)
    const intro = slot.querySelector('p.pg__muted')!
    const add = screen.getByRole('button', { name: 'Add Storage Place' })
    expect(kids).toContain(intro)
    expect(kids.some((k) => k.contains(list))).toBe(true)
    expect(kids).toContain(add)
    const d = declarations(readUiCss('ListPage.css'), '.list-page__list')
    expect(d['display']).toBe('grid')
    expect(d['gap']).toMatch(/^var\(--space-(3|4|5|6)\)$/)
  })
})
