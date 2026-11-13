// H9 (household-items.md section 4.11): /supplies shows each Supply's Stock level and a Use button that takes some out of Stock.
// The real hooks run against a stubbed fetch with the API's exact JSON (internal/stock/httpapi/use_test.go, GET /api/stock).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApi, refusal, type RecordedCall } from '../../../lib/baseRecipes/test-utils'
import { ToastProvider } from '../../../ui'
import { dishSoapJSON, toiletPaperJSON } from '../supply.test-helper'
import type { Ingredient, SupplyUseResult } from '../types'

vi.mock('../hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))

import { SuppliesScreen } from './SuppliesScreen'

const batteriesJSON: Ingredient = { ...toiletPaperJSON, id: 23, name: 'batteries', conversions: [], restockLevel: null }
const stockRow = (over: Record<string, unknown>) => ({
  ingredientId: 22, name: 'toilet paper', baseUnit: 'piece', total: 4, lotCount: 1, nextGoesOff: null, useSoon: false, spoiledCount: 0, imageUrl: '', kind: 'supply', ...over,
})
const totals = (paper: number) => ({ ingredients: [stockRow({ total: paper }), stockRow({ ingredientId: 21, name: 'dish soap', baseUnit: 'ml', total: 800 })] })

const paperUsed: SupplyUseResult = {
  ingredientId: 22, name: 'toilet paper', baseUnit: 'piece', quantity: 1, total: 3,
  taken: [{ lotId: 11, quantity: 1, purchased: '2026-11-01', storagePlaceId: 3, productId: 5, shopId: 6 }],
}
const soapUsed = (quantity: number): SupplyUseResult => ({
  ingredientId: 21, name: 'dish soap', baseUnit: 'ml', quantity, total: 800 - quantity,
  taken: [{ lotId: 31, quantity, purchased: '2026-11-02', storagePlaceId: null, productId: null, shopId: null }],
})
const pack = { id: 9, name: 'Soap 500 ml', ingredientId: 21, ingredientName: 'dish soap', baseUnit: 'ml', packSize: 500, image: '', imageUrl: '' }

function setup(handlers: Record<string, unknown> = {}) {
  let paper = 4
  const api = mockApi({
    'GET /api/ingredients?kind=supply': [toiletPaperJSON, dishSoapJSON, batteriesJSON],
    'GET /api/stock': () => totals(paper),
    'GET /api/products/last-bought?ingredient=21': pack,
    'POST /api/stock/ingredients/22/use': () => ((paper = 3), paperUsed),
    ...handlers,
  })
  const router = createMemoryRouter([{ path: '/supplies', element: <SuppliesScreen /> }, { path: '/settings', element: <p>settings</p> }], { initialEntries: ['/supplies'] })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  )
  return api
}
const row = (name: string) => screen.getByRole('button', { name }).closest('li') as HTMLElement
const posts = (api: ReturnType<typeof mockApi>, path: string): RecordedCall[] => api.callsTo('POST', path)

beforeEach(() => vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true))
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('SuppliesScreen: the stock level', () => {
  it('asks GET /api/stock once and shows each Supply\'s Stock beside its Restock level', async () => {
    const api = setup()
    expect(await screen.findByText('4 pieces · below Restock level 6')).toBeInTheDocument()
    expect(row('Dish soap')).toHaveTextContent('800 ml · restocks below 500 ml')
    expect(row('Batteries')).toHaveTextContent('None in Stock')
    expect(api.callsTo('GET', '/api/stock')).toHaveLength(1)
  })
  it('marks the Supply below its level with the info tone', async () => {
    setup()
    await screen.findByText('4 pieces · below Restock level 6')
    expect(row('Toilet paper').querySelector('.list-row__meta')).toHaveAttribute('data-status', 'info')
    expect(row('Dish soap').querySelector('.list-row__meta')).not.toHaveAttribute('data-status')
  })
  it('keeps the rows and the old meta when Stock fails to load, with every Use disabled', async () => {
    setup({ 'GET /api/stock': refusal(500, 'internal') })
    expect(await screen.findByText('piece · restocks below 6 pieces')).toBeInTheDocument()
    for (const name of ['Use one Toilet paper', 'Use some Dish soap', 'Use one Batteries']) expect(screen.getByRole('button', { name })).toBeDisabled()
  })
  it('disables Use for a Supply with no Stock', async () => {
    setup()
    await screen.findByText('4 pieces · below Restock level 6')
    expect(screen.getByRole('button', { name: 'Use one Batteries' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Use one Toilet paper' })).toBeEnabled()
  })
})

describe('SuppliesScreen: Use one piece', () => {
  it('takes one with a single tap, toasts with Undo and refreshes the level', async () => {
    const api = setup()
    await screen.findByText('4 pieces · below Restock level 6')
    await userEvent.click(screen.getByRole('button', { name: 'Use one Toilet paper' }))
    expect(await screen.findByText('Used 1 Toilet paper')).toBeInTheDocument()
    expect(posts(api, '/api/stock/ingredients/22/use').map((c) => c.body)).toEqual([{ quantity: 1 }])
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    await waitFor(() => expect(row('Toilet paper')).toHaveTextContent('3 pieces · below Restock level 6'))
    expect(api.callsTo('GET', '/api/stock').length).toBeGreaterThanOrEqual(2)
  })
  it('Undo puts back exactly what was taken', async () => {
    let paper = 3
    const api = setup({
      'GET /api/stock': () => totals(paper),
      'POST /api/stock/ingredients/22/use': () => ((paper = 3), paperUsed),
      'POST /api/stock/ingredients/22/use/undo': () => ((paper = 4), { ...paperUsed, quantity: 1, total: 4 }),
    })
    await screen.findByText(/pieces · below Restock level 6/)
    await userEvent.click(screen.getByRole('button', { name: 'Use one Toilet paper' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(await screen.findByText('Put back 1 Toilet paper')).toBeInTheDocument()
    expect(posts(api, '/api/stock/ingredients/22/use/undo').map((c) => c.body)).toEqual([{ taken: paperUsed.taken }])
    await waitFor(() => expect(row('Toilet paper')).toHaveTextContent('4 pieces · below Restock level 6'))
  })
  it('says so when there is less in Stock than the list showed', async () => {
    setup({ 'POST /api/stock/ingredients/22/use': refusal(422, 'use_exceeds_stock') })
    await screen.findByText('4 pieces · below Restock level 6')
    await userEvent.click(screen.getByRole('button', { name: 'Use one Toilet paper' }))
    expect(await screen.findByText('There is less in Stock than that')).toBeInTheDocument()
  })
  it('does nothing offline but say a connection is needed', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    const api = setup()
    await screen.findByText('4 pieces · below Restock level 6')
    await userEvent.click(screen.getByRole('button', { name: 'Use one Toilet paper' }))
    expect(await screen.findByText('Using a Supply needs a connection')).toBeInTheDocument()
    expect(posts(api, '/api/stock/ingredients/22/use')).toEqual([])
  })
  it('never offers the Use of food: the list only holds Supplies', async () => {
    const api = setup()
    await screen.findByText('4 pieces · below Restock level 6')
    expect(api.callsTo('GET', '/api/ingredients?kind=supply')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /^Use (one|some) / })).toHaveLength(3)
  })
})

describe('SuppliesScreen: Use some of a g or ml Supply', () => {
  const openSheet = async () => {
    await screen.findByText('800 ml · restocks below 500 ml')
    await userEvent.click(screen.getByRole('button', { name: 'Use some Dish soap' }))
    return screen.findByRole('dialog', { name: 'Use Dish soap' })
  }
  it('opens a sheet prefilled with the pack size of the Product last bought, and sends nothing until Use', async () => {
    const api = setup()
    const sheet = await openSheet()
    await waitFor(() => expect(within(sheet).getByRole('textbox', { name: 'How much' })).toHaveValue('500'))
    expect(posts(api, '/api/stock/ingredients/21/use')).toEqual([])
  })
  it('uses the amount typed, closes the sheet and toasts with Undo', async () => {
    const api = setup({ 'POST /api/stock/ingredients/21/use': () => soapUsed(250) })
    const sheet = await openSheet()
    const amount = within(sheet).getByRole('textbox', { name: 'How much' })
    await waitFor(() => expect(amount).toHaveValue('500'))
    await userEvent.clear(amount)
    await userEvent.type(amount, '250')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Use' }))
    expect(await screen.findByText('Used 250 ml of Dish soap')).toBeInTheDocument()
    expect(posts(api, '/api/stock/ingredients/21/use').map((c) => c.body)).toEqual([{ quantity: 250 }])
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })
  it('"Use all" takes the whole Stock', async () => {
    const api = setup({ 'POST /api/stock/ingredients/21/use': () => soapUsed(800) })
    const sheet = await openSheet()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Use all' }))
    expect(await screen.findByText('Used 800 ml of Dish soap')).toBeInTheDocument()
    expect(posts(api, '/api/stock/ingredients/21/use').map((c) => c.body)).toEqual([{ quantity: 800 }])
  })
  it('starts empty when the Supply was never bought as a Product (404)', async () => {
    setup({ 'GET /api/products/last-bought?ingredient=21': refusal(404, 'not_found') })
    const sheet = await openSheet()
    await waitFor(() => expect(within(sheet).getByRole('textbox', { name: 'How much' })).toHaveValue(''))
  })
  it('refuses more than is in Stock inside the sheet, sending nothing', async () => {
    const api = setup({ 'GET /api/products/last-bought?ingredient=21': refusal(404, 'not_found') })
    const sheet = await openSheet()
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'How much' }), '900')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Use' }))
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Only 800 ml in Stock')
    expect(posts(api, '/api/stock/ingredients/21/use')).toEqual([])
  })
  it('closes without using anything on Escape', async () => {
    const api = setup()
    await openSheet()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(posts(api, '/api/stock/ingredients/21/use')).toEqual([])
  })
})
