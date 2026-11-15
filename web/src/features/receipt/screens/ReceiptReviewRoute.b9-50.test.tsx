// B9-50 (SSP-08): the route wires the review's Add… to the sheet with its receipt context: the line as printed and priced ("On the receipt"), the
// name matches of the Household's Products and open Lines ("Is it one of these?", Products first), and "Use <Product>" as a draft of that Product
// that the apply sends as { id, productId }. The review row of a line whose name matches a Product says so. The data hook is stood in for.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider, ToastProvider } from '../../../ui'
import type { OfflineProduct } from '../../scan/types'
import { takePendingReceiptApplied } from '../lib/appliedEvents'
import { forgetRead, rememberRead } from '../lib/readStore'
import { publishReceiptSession } from '../lib/receiptSession'
import { price0, proposal, READ_ID, readDone, SHOP_ID, UUIDS } from '../fixtures.test-helper'

const api = vi.hoisted(() => ({ startRead: vi.fn(), getRead: vi.fn(), cancelRead: vi.fn(), apply: vi.fn() }))
vi.mock('../api', () => ({ receiptApi: api }))
vi.mock('../../../app/useMe', () => ({ useMe: () => ({ data: { id: 1, email: 'a@b.c', displayName: 'A', isAdmin: false } }) }))
vi.mock('../../products/hooks/useCurrency', () => ({ useCurrency: () => 'EUR' }))
const data = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
vi.mock('../hooks/useAddSheetData', () => ({ useAddSheetData: () => data.current }))

import { ReceiptReviewRoute } from './ReceiptReviewRoute'

const kitchenRollAdd = proposal({
  id: 'add:2', kind: 'add', line: 2, text: 'KITCHEN ROLL 4 PACK', needsInput: true, after: { name: 'Kitchen roll', count: 1, priceCents: 349, packSize: 4, packUnit: 'piece' },
})
const products: OfflineProduct[] = [
  { id: 50, name: 'Kitchen roll 4 pack', ingredientId: 7, ingredientName: 'Kitchen roll', baseUnit: 'piece', packSize: 4, lastPriceCents: null },
]

beforeEach(() => {
  vi.clearAllMocks()
  forgetRead()
  takePendingReceiptApplied()
  publishReceiptSession({ shopId: SHOP_ID, clientUuids: UUIDS })
  rememberRead({ readId: READ_ID, shopId: SHOP_ID, clientUuids: UUIDS, read: readDone({ proposals: [price0, kitchenRollAdd] }) })
  data.current = {
    shopName: 'Coop',
    ingredients: [{ id: 7, name: 'Kitchen roll', baseUnit: 'piece' }],
    lines: [{ ingredientId: 7, name: 'Kitchen roll', baseUnit: 'piece', quantity: 2, ticked: false }, { ingredientId: 8, name: 'Cheese', baseUnit: 'g', quantity: 88, ticked: false }],
    products,
    findSimilar: undefined,
  }
})
afterEach(() => {
  forgetRead()
  publishReceiptSession(undefined)
  takePendingReceiptApplied()
})

const show = () =>
  render(
    <MemoryRouter initialEntries={['/scan/receipt/review']}>
      <ToastProvider>
        <ConfirmProvider>
          <Routes>
            <Route path="/scan/receipt/review" element={<ReceiptReviewRoute />} />
            <Route path="*" element={<p>elsewhere</p>} />
          </Routes>
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
const openAdd = () => userEvent.click(screen.getByRole('button', { name: 'Add KITCHEN ROLL 4 PACK' }))
const sheet = () => screen.getByRole('dialog', { name: 'What is this?' })

describe('the review route, Add… with its receipt context', () => {
  it('the row of a line whose name matches a Product says so', () => {
    show()
    expect(within(screen.getByRole('list', { name: 'Not scanned' })).getByText('Kitchen roll 4 pack is a Product')).toBeInTheDocument()
  })
  it('the sheet shows the line as printed with its price, then "Is it one of these?" with the Product first', async () => {
    show()
    await openAdd()
    const block = within(sheet()).getByRole('region', { name: 'On the receipt' })
    expect(block).toHaveTextContent('KITCHEN ROLL 4 PACK')
    expect(block).toHaveTextContent('€3.49')
    expect(block).toHaveTextContent('×1 at €3.49')
    const radios = within(within(sheet()).getByRole('radiogroup', { name: 'Is it one of these?' })).getAllByRole('radio')
    expect(radios[0]).toHaveAccessibleName(/^Kitchen roll 4 pack.*Product · 4 pieces/)
    expect(radios[1]).toHaveAccessibleName(/^Kitchen roll.*Line · 2 pieces/)
    expect(sheet()).toHaveTextContent('Kitchen roll 4 pack: 1 Scan at €3.49, and it ticks Kitchen roll.')
  })
  it('"Use Kitchen roll 4 pack" closes the sheet, checks the row and sends { id, productId } to the apply', async () => {
    api.apply.mockResolvedValue({ ok: true, applied: 2, results: [], undone: [] })
    show()
    await openAdd()
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Use Kitchen roll 4 pack' }))
    expect(screen.queryByRole('dialog', { name: 'What is this?' })).toBeNull()
    expect(screen.getByRole('checkbox', { name: /^Kitchen roll/ })).toBeChecked()
    await userEvent.click(within(screen.getByRole('group', { name: 'Actions' })).getByRole('button', { name: /^Apply 2 changes$/ }))
    const body = api.apply.mock.calls[0]![0]
    expect(body.accept.map((a: { id: string }) => a.id)).toEqual(['price:0', 'add:2'])
    expect(body.adds).toEqual([{ id: 'add:2', productId: 50 }])
  })
  it('Edit on that row opens the sheet again at the matches, not on a form', async () => {
    show()
    await openAdd()
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Use Kitchen roll 4 pack' }))
    await userEvent.click(screen.getByRole('button', { name: 'Edit KITCHEN ROLL 4 PACK' })) // ruling 2 (P38): named after its line
    expect(within(sheet()).getByRole('radiogroup', { name: 'Is it one of these?' })).toBeInTheDocument()
  })
  it('with no Product or Line matching, the sheet is "Which Line is it?" and the row says nothing about a Product', async () => {
    data.current = { ...data.current, products: [], lines: [{ ingredientId: 8, name: 'Cheese', baseUnit: 'g', quantity: 88, ticked: false }] }
    show()
    expect(screen.queryByText(/is a Product/)).toBeNull()
    await openAdd()
    expect(within(sheet()).queryByRole('radiogroup', { name: 'Is it one of these?' })).toBeNull()
    expect(within(sheet()).getByRole('group', { name: 'Which Line is it?' })).toBeInTheDocument()
    expect(within(sheet()).getByRole('region', { name: 'On the receipt' })).toBeInTheDocument()
  })
})
