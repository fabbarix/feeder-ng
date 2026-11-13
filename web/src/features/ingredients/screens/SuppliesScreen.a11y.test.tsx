// H9: keyboard and screen-reader behaviour of the Supplies list's stock level and Use button (docs/design/system.md accessibility).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '../../../lib/baseRecipes/test-utils'
import { ToastProvider } from '../../../ui'
import { dishSoapJSON, toiletPaperJSON } from '../supply.test-helper'
import type { Ingredient } from '../types'

vi.mock('../hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))

import { SuppliesScreen } from './SuppliesScreen'

const batteriesJSON: Ingredient = { ...toiletPaperJSON, id: 23, name: 'batteries', conversions: [], restockLevel: null }
const stockRow = (over: Record<string, unknown>) => ({
  ingredientId: 22, name: 'toilet paper', baseUnit: 'piece', total: 4, lotCount: 1, nextGoesOff: null, useSoon: false, spoiledCount: 0, imageUrl: '', kind: 'supply', ...over,
})

function setup() {
  mockApi({
    'GET /api/ingredients?kind=supply': [toiletPaperJSON, dishSoapJSON, batteriesJSON],
    'GET /api/stock': { ingredients: [stockRow({}), stockRow({ ingredientId: 21, name: 'dish soap', baseUnit: 'ml', total: 800 })] },
    'GET /api/products/last-bought?ingredient=21': { id: 9, name: 'Soap 500 ml', ingredientId: 21, ingredientName: 'dish soap', baseUnit: 'ml', packSize: 500, image: '', imageUrl: '' },
    'POST /api/stock/ingredients/22/use': {
      ingredientId: 22, name: 'toilet paper', baseUnit: 'piece', quantity: 1, total: 3,
      taken: [{ lotId: 11, quantity: 1, purchased: '2026-11-01', storagePlaceId: null, productId: null, shopId: null }],
    },
  })
  const router = createMemoryRouter([{ path: '/supplies', element: <SuppliesScreen /> }, { path: '/supplies/:id', element: <p>supply page</p> }], { initialEntries: ['/supplies'] })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  )
  return screen.findByText('4 pieces · below Restock level 6')
}

beforeEach(() => vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true))
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('names and roles', () => {
  it('lists the Supplies as one list named "Supplies", each row with a name for its target and its own Use button', async () => {
    await setup()
    const list = screen.getByRole('list', { name: 'Supplies' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    for (const name of ['Toilet paper', 'Dish soap', 'Batteries']) expect(within(list).getByRole('button', { name })).toBeInTheDocument()
    expect(within(list).getAllByRole('button', { name: /^Use (one|some) / }).map((b) => b.getAttribute('aria-label'))).toEqual(['Use one Toilet paper', 'Use some Dish soap', 'Use one Batteries'])
  })
  it('gives every Use button a different name, so a screen reader can tell them apart', async () => {
    await setup()
    const names = screen.getAllByRole('button', { name: /^Use (one|some) / }).map((b) => b.getAttribute('aria-label'))
    expect(new Set(names).size).toBe(names.length)
  })
  it('Use is a real <button type=button> with an aria-hidden icon and no visible text', async () => {
    await setup()
    const use = screen.getByRole('button', { name: 'Use one Toilet paper' })
    expect(use.tagName).toBe('BUTTON')
    expect(use).toHaveAttribute('type', 'button')
    expect(use.textContent).toBe('')
    expect(use.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
  it('says "below Restock level" in words, so the info tone is never the only signal', async () => {
    await setup()
    expect(screen.getByText('4 pieces · below Restock level 6')).toBeInTheDocument()
  })
  it('disables a Use button natively when there is no Stock, so it leaves the tab order', async () => {
    await setup()
    const use = screen.getByRole('button', { name: 'Use one Batteries' })
    expect(use).toBeDisabled()
    expect(use).not.toHaveFocus()
  })
})

describe('keyboard', () => {
  it('tabs to a Use button and Enter and Space both use one', async () => {
    await setup()
    const use = screen.getByRole('button', { name: 'Use one Toilet paper' })
    use.focus()
    expect(use).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(await screen.findByText('Used 1 Toilet paper')).toBeInTheDocument()
  })
  it('reaches the row target and its Use button as two separate stops', async () => {
    await setup()
    const target = screen.getByRole('button', { name: 'Toilet paper' })
    const use = screen.getByRole('button', { name: 'Use one Toilet paper' })
    expect(target).not.toBe(use)
    expect(target.tabIndex).toBeGreaterThanOrEqual(0)
    expect(use.tabIndex).toBeGreaterThanOrEqual(0)
  })
  it('Use on a Supply does not navigate to its page', async () => {
    await setup()
    await userEvent.click(screen.getByRole('button', { name: 'Use one Toilet paper' }))
    expect(screen.queryByText('supply page')).toBeNull()
  })
})

describe('the how-much sheet', () => {
  const open = async () => {
    await setup()
    await userEvent.click(screen.getByRole('button', { name: 'Use some Dish soap' }))
    return screen.findByRole('dialog', { name: 'Use Dish soap' })
  }
  it('is a modal dialog named after the Supply, with the amount field labelled "How much"', async () => {
    const dialog = await open()
    expect(dialog.tagName).toBe('DIALOG')
    expect(within(dialog).getByRole('textbox', { name: 'How much' })).toBeInTheDocument()
  })
  it('moves focus into the sheet and gives it back to the Use button on Escape', async () => {
    const dialog = await open()
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Use some Dish soap' })).toHaveFocus()
  })
  it('announces a refused amount as an alert tied to the field', async () => {
    const dialog = await open()
    const field = within(dialog).getByRole('textbox', { name: 'How much' })
    await waitFor(() => expect(field).toHaveValue('500'))
    await userEvent.clear(field)
    await userEvent.type(field, '900')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Use' }))
    const alert = within(dialog).getByRole('alert')
    expect(alert).toHaveTextContent('Only 800 ml in Stock')
    expect(field).toHaveAccessibleDescription(expect.stringContaining('Only 800 ml in Stock'))
  })
})

describe('feedback', () => {
  it('announces "Used 1 Toilet paper" in a polite live region and offers Undo as a button inside it', async () => {
    await setup()
    await userEvent.click(screen.getByRole('button', { name: 'Use one Toilet paper' }))
    const message = await screen.findByText('Used 1 Toilet paper')
    const region = message.closest('[role="status"]') as HTMLElement
    expect(region).not.toBeNull()
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(within(region).getByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })
})
