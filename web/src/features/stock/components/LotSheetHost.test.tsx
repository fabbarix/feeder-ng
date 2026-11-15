// B9-44 (TB-11): Today opens a Use soon row's Lot in the Pantry's own Lot sheet, over Today, without leaving it. New component
// features/stock/components/LotSheetHost.tsx, exported from features/stock: `<LotSheetHost lotId onClose />` reads the Lot, the Storage Places and the
// unit system itself and wires the sheet's actions (Move, Edit, Delete) like the Pantry does. It renders nothing for a null `lotId`.
import { screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithProviders } from '../../settings/test-utils'
import type { StockLot } from '../types'
import { LotSheetHost } from './LotSheetHost'

const lot = (over: Partial<StockLot> = {}): StockLot =>
  ({ id: 11, ingredientId: 1, ingredientName: 'flour', baseUnit: 'g', quantity: 500, purchased: '2026-11-01', goesOff: '2026-11-10', source: 'manual', productId: null, shopId: null, spoiled: false, useSoon: true, storagePlaceId: 1, ...over }) as StockLot
const api = (lots: StockLot[]) =>
  mockApi({
    'GET /api/stock/lots': { lots, today: '2026-11-09' },
    'GET /api/storage-places': [{ id: 1, name: 'Kitchen Pantry', kind: 'pantry', default: true }, { id: 2, name: 'Garage Freezer', kind: 'freezer', default: false }],
  })
afterEach(() => vi.unstubAllGlobals())

describe('LotSheetHost', () => {
  it('shows the Lot of the id in the Lot sheet, titled by its Ingredient, with Edit and Delete', async () => {
    api([lot(), lot({ id: 12, ingredientName: 'milk' })])
    renderWithProviders(createElement(LotSheetHost, { lotId: 11, onClose: () => {} }))
    expect(await screen.findByRole('dialog', { name: 'Flour' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('renders nothing for no Lot', () => {
    api([lot()])
    const { container } = renderWithProviders(createElement(LotSheetHost, { lotId: null, onClose: () => {} }))
    expect(container.querySelector('dialog[open]')).toBeNull()
  })

  it('renders nothing for a Lot that is gone (no empty sheet)', async () => {
    const mock = api([lot()])
    renderWithProviders(createElement(LotSheetHost, { lotId: 999, onClose: () => {} }))
    await waitFor(() => expect(mock.callsTo('GET', '/api/stock/lots').length).toBeGreaterThan(0))
    await new Promise((r) => setTimeout(r, 50))
    expect(document.querySelector('dialog[open]')).toBeNull()
  })
})
