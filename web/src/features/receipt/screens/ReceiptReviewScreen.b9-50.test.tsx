// B9-50 (SSP-08, A11Y-09 receipt row): the review's rows and Accept all, over the real useReceiptReview with a mocked api.
//   Accept all: "Accept all N" (N = the rows that need no choice, checked or not); with N = 0 there is no Accept all and a quiet note says why:
//   "Accept all has nothing to check: every line below needs you to say what it is."
//   Every row is a ListRow (DS 3): the key (the name read), the state at the row's end, the printed line muted under it. A Not scanned row has NO
//   checkbox until it is set up: its control is "Add…" (named "Add <printed line>", the only button of the row's target) and the whole row opens
//   it. Once set up (a complete draft, or a Product by id) the checkbox appears, checked, with Edit beside it. A Not scanned row whose name
//   matches a Product of the `products` prop says "<Product> is a Product".
//   A Product chosen for the line goes to the apply as { id, productId } and nothing else.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider, ToastProvider } from '../../../ui'
import { takePendingReceiptApplied } from '../lib/appliedEvents'
import { forgetRead, rememberRead } from '../lib/readStore'
import { publishReceiptSession } from '../lib/receiptSession'
import { add0, add1, completeDraft, missing5, price0, READ_ID, readDone, SHOP_ID, UUIDS } from '../fixtures.test-helper'

const api = vi.hoisted(() => ({ startRead: vi.fn(), getRead: vi.fn(), cancelRead: vi.fn(), apply: vi.fn() }))
vi.mock('../api', () => ({ receiptApi: api }))
vi.mock('../../../app/useMe', () => ({ useMe: () => ({ data: { id: 1, email: 'a@b.c', displayName: 'A', isAdmin: false } }) }))
vi.mock('../../products/hooks/useCurrency', () => ({ useCurrency: () => 'EUR' }))

import { ReceiptReviewScreen, type AddSheetRenderProps } from './ReceiptReviewScreen'

function show(o: { renderAdd?: (p: AddSheetRenderProps) => ReactNode; products?: { id: number; name: string }[] } = {}) {
  return render(
    <MemoryRouter initialEntries={['/scan/receipt/review']}>
      <ToastProvider>
        <ConfirmProvider>
          <div data-testid="screen">
            <Routes>
              <Route path="/scan/receipt/review" element={<ReceiptReviewScreen renderAdd={o.renderAdd} products={o.products} />} />
              <Route path="*" element={<p>elsewhere</p>} />
            </Routes>
          </div>
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}
const notScanned = () => within(screen.getByRole('list', { name: 'Not scanned' }))
const rowOfText = (text: string | RegExp) => notScanned().getByText(text).closest('li') as HTMLElement
const applyButton = () => within(screen.getByRole('group', { name: 'Actions' })).getByRole('button', { name: /^Apply \d+ changes?$/ })
const keep = (proposals = readDone().proposals) => rememberRead({ readId: READ_ID, shopId: SHOP_ID, clientUuids: UUIDS, read: readDone({ proposals }) })

beforeEach(() => {
  vi.clearAllMocks()
  forgetRead()
  takePendingReceiptApplied()
  publishReceiptSession({ shopId: SHOP_ID, clientUuids: UUIDS })
  keep()
})
afterEach(() => {
  forgetRead()
  publishReceiptSession(undefined)
  takePendingReceiptApplied()
})

describe('Accept all says what it does', () => {
  it('counts the rows that need no choice: "Accept all 6", although 5 of them are already checked', () => {
    show()
    expect(screen.getByRole('button', { name: 'Accept all 6' })).toBeInTheDocument()
    expect(screen.queryByText(/Accept all has nothing to check/)).toBeNull()
  })
  it('after it, the button reads "Clear all", and Apply counts what was checked', async () => {
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Accept all 6' }))
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Accept all/ })).toBeNull()
    expect(applyButton()).toHaveTextContent('Apply 6 changes')
  })
  it('with nothing that can be accepted there is no Accept all, and a note says why', () => {
    keep([add0, add1, missing5])
    show()
    expect(screen.queryByRole('button', { name: /^Accept all/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull()
    expect(screen.getByText('Accept all has nothing to check: every line below needs you to say what it is.')).toBeInTheDocument()
    expect(applyButton()).toBeDisabled()
    expect(applyButton()).toHaveTextContent('Apply 0 changes')
  })
  it('one row that needs no choice is "Accept all 1"', () => {
    keep([price0, add0])
    show()
    expect(screen.getByRole('button', { name: 'Accept all 1' })).toBeInTheDocument()
  })
})

describe('the rows are ListRows', () => {
  it('every row of every section is a .list-row, and none is the old .receipt-row', () => {
    show()
    const rows = screen.getAllByRole('listitem').filter((li) => li.closest('.receipt-section__list, ul[aria-label]'))
    const review = rows.filter((li) => ['Prices', 'Weighed Products', 'Quantities', 'Corrections', 'Not scanned', 'Not on the receipt'].includes(li.closest('ul')?.getAttribute('aria-label') ?? ''))
    expect(review).toHaveLength(9)
    for (const li of review) {
      expect(li).toHaveClass('list-row')
      expect(li).not.toHaveClass('receipt-row')
    }
  })
  it('the whole row of a checkbox toggles it (the row is the target)', async () => {
    show()
    await userEvent.click(within(screen.getByRole('list', { name: 'Prices' })).getByText('MUTTI PASSATA 700G 2 x 1,35'))
    expect(screen.getByRole('checkbox', { name: /^Mutti passata 700 g/ })).not.toBeChecked()
  })
})

describe('a Not scanned row has no checkbox until it is set up', () => {
  it('shows the name, the state at the end, the printed line, and no checkbox', () => {
    show()
    const row = rowOfText('Pane casereccio')
    expect(row).toHaveTextContent('450 g · €2.25')
    expect(row).toHaveTextContent('PANE CASERECCIO 0,45 kg 2,25')
    expect(notScanned().queryAllByRole('checkbox')).toHaveLength(0)
  })
  it('its control is "Add…", named after the printed line, one button in the row', () => {
    show()
    const row = rowOfText('Pane casereccio')
    const button = within(row).getByRole('button', { name: 'Add PANE CASERECCIO 0,45 kg 2,25' })
    expect(button).toHaveTextContent('Add…')
    expect(within(rowOfText('Bananas')).getByRole('button', { name: 'Add BANANE 1,2 kg 1,80' })).toBeInTheDocument()
  })
  it('the Add… button opens the sheet, and so does the row\'s text', async () => {
    const renderAdd = vi.fn((_p: AddSheetRenderProps) => null as ReactNode)
    show({ renderAdd })
    await userEvent.click(within(rowOfText('Pane casereccio')).getByRole('button', { name: /^Add PANE/ }))
    expect(renderAdd.mock.calls.at(-1)![0].proposal.id).toBe('add:0')
    await userEvent.click(within(rowOfText('Bananas')).getByText('BANANE 1,2 kg 1,80'))
    expect(renderAdd.mock.calls.at(-1)![0].proposal.id).toBe('add:1')
  })
  it('an Add that was set up gets its checkbox, checked, with Edit; Apply counts it', async () => {
    const renderAdd = ({ onSave }: AddSheetRenderProps) => <button type="button" onClick={() => onSave(completeDraft)}>Save add</button>
    show({ renderAdd })
    await userEvent.click(within(rowOfText('Pane casereccio')).getByRole('button', { name: /^Add PANE/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save add' }))
    const row = rowOfText('Pane casereccio')
    expect(within(row).getByRole('checkbox', { name: /^Pane casereccio/ })).toBeChecked()
    expect(within(row).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(row).toHaveTextContent('Set up, ready to apply')
    expect(applyButton()).toHaveTextContent('Apply 6 changes')
    expect(within(rowOfText('Bananas')).queryByRole('checkbox')).toBeNull()
  })
  it('an incomplete draft leaves the row without a checkbox', async () => {
    const renderAdd = ({ onSave }: AddSheetRenderProps) => <button type="button" onClick={() => onSave({ ...completeDraft, productName: '' })}>Save incomplete</button>
    show({ renderAdd })
    await userEvent.click(within(rowOfText('Pane casereccio')).getByRole('button', { name: /^Add PANE/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save incomplete' }))
    expect(within(rowOfText('Pane casereccio')).queryByRole('checkbox')).toBeNull()
    expect(applyButton()).toHaveTextContent('Apply 5 changes')
  })
})

describe('a line that is already a Product', () => {
  it('a Not scanned row whose name matches a Product says "<Product> is a Product"', () => {
    show({ products: [{ id: 77, name: 'Pane casereccio 450 g' }] })
    expect(rowOfText('Pane casereccio')).toHaveTextContent('Pane casereccio 450 g is a Product')
    expect(rowOfText('Bananas')).not.toHaveTextContent('is a Product')
  })
  it('no Products, no such line', () => {
    show()
    expect(screen.queryByText(/is a Product$/)).toBeNull()
  })
  it('choosing the Product checks the row and the apply sends { id, productId } and nothing more', async () => {
    api.apply.mockResolvedValue({ ok: true, applied: 6, results: [], undone: [] })
    const renderAdd = ({ onSave }: AddSheetRenderProps) => <button type="button" onClick={() => onSave({ ingredient: null, productName: '', packSize: 0, productId: 77 })}>Use product</button>
    show({ renderAdd, products: [{ id: 77, name: 'Pane casereccio 450 g' }] })
    await userEvent.click(within(rowOfText('Pane casereccio')).getByRole('button', { name: /^Add PANE/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Use product' }))
    expect(within(rowOfText('Pane casereccio')).getByRole('checkbox', { name: /^Pane casereccio/ })).toBeChecked()
    await userEvent.click(applyButton())
    const body = api.apply.mock.calls[0]![0]
    expect(body.accept.map((a: { id: string }) => a.id)).toContain('add:0')
    expect(body.adds).toEqual([{ id: 'add:0', productId: 77 }])
  })
})
