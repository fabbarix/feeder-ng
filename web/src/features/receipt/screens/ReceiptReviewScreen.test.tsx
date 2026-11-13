// RR4: route /scan/receipt/review (design 3.4, 7.2, 9; mock-ups 15, 16, 17), over the real useReceiptReview with a mocked api.
// Pinned API of ./ReceiptReviewScreen:
//   <ReceiptReviewScreen renderAdd?={(p: AddSheetRenderProps) => ReactNode} />
//   AddSheetRenderProps = { proposal: Proposal; draft: AddDraft | undefined; onSave(draft: AddDraft): void; onClose(): void }
//   THE ADD SEAM. Pressing "Add…" (or "Edit" on a ready Add) on a Not scanned row makes the screen call renderAdd with that proposal and render
//   what it returns (SR5's NewProductSheet in no-barcode mode, wired at integration; a <dialog>/sheet). onSave stores the draft
//   (reviewState.setAdd) and closes it; onClose closes it without saving. Without renderAdd the Add… button is still shown.
//   The kept read comes from lib/readStore; the Household's currency from features/products/hooks/useCurrency.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider, ToastProvider } from '../../../ui'
import { takePendingReceiptApplied } from '../lib/appliedEvents'
import { forgetRead, recallRead, rememberRead } from '../lib/readStore'
import { publishReceiptSession } from '../lib/receiptSession'
import { completeDraft, FINGERPRINT, READ_ID, readDone, scanResult, SHOP_ID, UUIDS } from '../fixtures.test-helper'

const api = vi.hoisted(() => ({ startRead: vi.fn(), getRead: vi.fn(), cancelRead: vi.fn(), apply: vi.fn() }))
vi.mock('../api', () => ({ receiptApi: api }))
const me = vi.hoisted(() => ({ isAdmin: false }))
vi.mock('../../../app/useMe', () => ({ useMe: () => ({ data: { id: 1, email: 'a@b.c', displayName: 'A', isAdmin: me.isAdmin } }) }))
vi.mock('../../products/hooks/useCurrency', () => ({ useCurrency: () => 'EUR' }))

import { ReceiptReviewScreen, type AddSheetRenderProps } from './ReceiptReviewScreen'

const Where = () => <p data-testid="where">{useLocation().pathname}</p>
function show(renderAdd?: (p: AddSheetRenderProps) => ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/scan', '/scan/receipt/review']} initialIndex={1}>
      <ToastProvider>
        <ConfirmProvider>
          <Routes>
            <Route path="/scan/receipt/review" element={<ReceiptReviewScreen renderAdd={renderAdd} />} />
            <Route path="/scan/receipt" element={<p>photos page</p>} />
            <Route path="/scan" element={<p>scan page</p>} />
          </Routes>
          <Where />
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}
const check = (name: RegExp | string) => screen.getByRole('checkbox', { name }) as HTMLInputElement
const rowOf = (name: RegExp | string) => check(name).closest('li') as HTMLElement
const applyButton = () => within(screen.getByRole('group', { name: 'Actions' })).getByRole('button', { name: /^Apply \d+ changes?$/ })
const refused = (status: number, code: string, extra: Record<string, unknown> = {}, results: unknown[] = []) => ({ ok: false, status, code, message: 'server words', results, ...extra })

beforeEach(() => {
  vi.clearAllMocks()
  forgetRead()
  takePendingReceiptApplied()
  publishReceiptSession({ shopId: SHOP_ID, clientUuids: UUIDS })
  me.isAdmin = false
  rememberRead({ readId: READ_ID, shopId: SHOP_ID, clientUuids: UUIDS, read: readDone() })
})
afterEach(() => {
  forgetRead()
  publishReceiptSession(undefined)
  takePendingReceiptApplied()
})

describe('the header, the tiles and the sections', () => {
  it('has the title, Back and the promise that nothing changes yet', () => {
    show()
    expect(screen.getByRole('heading', { level: 1, name: 'Review the receipt' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    expect(screen.getByText('Nothing changes until you apply.')).toBeInTheDocument()
  })
  it('shows the Receipt, the Scanned total and the number of lines as metric tiles', () => {
    show()
    const tiles = screen.getByRole('group', { name: 'Receipt totals' })
    expect(tiles).toHaveTextContent(/Receipt\s*€20\.45/)
    expect(tiles).toHaveTextContent(/Scanned\s*€21\.58/)
    expect(tiles).toHaveTextContent(/Lines\s*7/)
  })
  it('the Receipt tile has a dash when the receipt printed no total', () => {
    const d = readDone()
    rememberRead({ readId: READ_ID, shopId: SHOP_ID, clientUuids: UUIDS, read: { ...d, totals: { ...d.totals, receiptCents: undefined }, notes: [] } })
    show()
    expect(screen.getByRole('group', { name: 'Receipt totals' })).toHaveTextContent(/Receipt\s*—/)
  })
  it('the difference is said in a note (€1.13 less), with the loyalty discount, never spread over Prices', () => {
    show()
    expect(screen.getByText('The receipt total is €1.13 less than the Scanned list. Check the lines below.')).toBeInTheDocument()
    expect(screen.getByText(/A discount of .*€2\.00 is in the receipt total; it is not spread over Prices\./)).toBeInTheDocument()
  })
  it('has the sections in order, with their counts, as headings over labelled lists', () => {
    show()
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(['Prices (3)', 'Weights (1)', 'Quantities (1)', 'Corrections (1)', 'Not scanned (2)', 'Not on the receipt (1)'])
    for (const name of ['Prices', 'Weights', 'Quantities', 'Corrections', 'Not scanned', 'Not on the receipt']) expect(screen.getByRole('list', { name })).toBeInTheDocument()
  })
  it('leaves out a section the read has nothing for', () => {
    const d = readDone()
    rememberRead({ readId: READ_ID, shopId: SHOP_ID, clientUuids: UUIDS, read: { ...d, proposals: d.proposals.filter((p) => p.kind === 'price') } })
    show()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Prices (3)'])
  })
})

describe('the rows', () => {
  it('a Price row: the Product, the change and the line as printed', () => {
    show()
    const row = rowOf(/^Mutti passata 700 g/)
    expect(row).toHaveTextContent('Mutti passata 700 g')
    expect(row).toHaveTextContent('€1.29 → €1.35 per pack')
    expect(row).toHaveTextContent('MUTTI PASSATA 700G 2 x 1,35')
  })
  it('the other kinds say their change', () => {
    show()
    expect(screen.getAllByRole('checkbox', { name: /^Regina toilet paper 9 pieces/ })).toHaveLength(2) // its Price and its pack size
    expect(screen.getByRole('list', { name: 'Corrections' })).toHaveTextContent('Pack size 9 pieces → 12 pieces')
    expect(screen.getAllByText(/Add price/).length).toBeGreaterThan(0)
    expect(rowOf(/^Parmigiano Reggiano/)).toHaveTextContent('312 g → 318 g · €6.36')
    expect(rowOf(/^Granarolo mozzarella 125 g/)).toHaveTextContent('×3 → ×4 (the receipt has 4)')
  })
  it('Prices, Weights and Quantities are checked; Corrections, Not scanned and Not on the receipt are not (the user\'s answer)', () => {
    show()
    for (const n of [/^Mutti passata 700 g/, /^Barilla spaghetti/, /^Parmigiano Reggiano/, /^Granarolo mozzarella/]) expect(check(n)).toBeChecked()
    const corrections = within(screen.getByRole('list', { name: 'Corrections' }))
    expect(corrections.getByRole('checkbox')).not.toBeChecked()
    expect(check(/^Pane casereccio/)).not.toBeChecked()
    expect(check(/^Bananas/)).not.toBeChecked()
    expect(check(/^Monini olive oil/)).not.toBeChecked()
  })
  it('the checkboxes are our own (a real input under the styling), each named after its row', () => {
    show()
    expect(screen.getAllByRole('checkbox')).toHaveLength(9)
    for (const box of screen.getAllByRole('checkbox')) expect(box).toHaveAccessibleName()
  })
  it('the whole row toggles its checkbox', async () => {
    show()
    await userEvent.click(within(rowOf(/^Mutti passata 700 g/)).getByText('MUTTI PASSATA 700G 2 x 1,35'))
    expect(check(/^Mutti passata 700 g/)).not.toBeChecked()
    await userEvent.click(check(/^Mutti passata 700 g/))
    expect(check(/^Mutti passata 700 g/)).toBeChecked()
  })
  it('Not on the receipt shows the Scanned row, says so, and has Remove', async () => {
    show()
    const row = rowOf(/^Monini olive oil/)
    expect(row).toHaveTextContent('Not on the receipt')
    expect(row).toHaveTextContent('×1')
    expect(row).toHaveTextContent('€8.90')
    await userEvent.click(within(row).getByRole('button', { name: 'Remove' }))
    expect(check(/^Monini olive oil/)).toBeChecked()
    expect(applyButton()).toHaveTextContent('Apply 6 changes')
  })
  it('a Not scanned row shows the receipt line and Add…', () => {
    show()
    const row = rowOf(/^Pane casereccio/)
    expect(row).toHaveTextContent('0.45 kg · €2.25')
    expect(row).toHaveTextContent('PANE CASERECCIO 0,45 kg 2,25')
    expect(within(row).getByRole('button', { name: 'Add…' })).toBeInTheDocument()
  })
})

describe('Accept all and the count', () => {
  it('"Apply N changes" counts the checked rows and follows each toggle', async () => {
    show()
    expect(applyButton()).toHaveTextContent('Apply 5 changes')
    await userEvent.click(check(/^Barilla spaghetti/))
    expect(applyButton()).toHaveTextContent('Apply 4 changes')
  })
  it('one change is singular', async () => {
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Accept all' })) // 6
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    await userEvent.click(check(/^Barilla spaghetti/))
    expect(applyButton()).toHaveTextContent('Apply 1 change')
  })
  it('Accept all checks the Correction too, never Remove, and leaves the Adds; then it reads Clear all', async () => {
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Accept all' }))
    expect(within(screen.getByRole('list', { name: 'Corrections' })).getByRole('checkbox')).toBeChecked()
    expect(check(/^Monini olive oil/)).not.toBeChecked()
    expect(check(/^Pane casereccio/)).not.toBeChecked()
    expect(applyButton()).toHaveTextContent('Apply 6 changes')
    expect(screen.queryByRole('button', { name: 'Accept all' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(applyButton()).toHaveTextContent('Apply 0 changes')
    expect(screen.getByRole('button', { name: 'Accept all' })).toBeInTheDocument()
  })
  it('Apply is disabled at 0 changes', async () => {
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Accept all' }))
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(applyButton()).toBeDisabled()
  })
})

describe('Add…: the seam for the new-Product sheet (SR5, wired at integration)', () => {
  const sheet = vi.fn(({ proposal, draft, onSave, onClose }: AddSheetRenderProps) => (
    <dialog open aria-label={`Add ${proposal.id}`} data-draft={draft ? 'yes' : 'no'}>
      <button type="button" onClick={() => onSave(completeDraft)}>Save add</button>
      <button type="button" onClick={() => onSave({ ...completeDraft, productName: '' })}>Save incomplete</button>
      <button type="button" onClick={onClose}>Close add</button>
    </dialog>
  ))
  beforeEach(() => sheet.mockClear())

  it('renders nothing of it until Add… is pressed, then calls renderAdd with the proposal and no draft', async () => {
    show(sheet)
    expect(sheet).not.toHaveBeenCalled()
    await userEvent.click(within(rowOf(/^Pane casereccio/)).getByRole('button', { name: 'Add…' }))
    const props = sheet.mock.calls.at(-1)![0]
    expect(props.proposal.id).toBe('add:0')
    expect(props.draft).toBeUndefined()
    expect(screen.getByRole('dialog', { name: 'Add add:0' })).toBeInTheDocument()
  })
  it('Save with a complete draft closes it, checks the row and counts it; the row is ready and offers Edit', async () => {
    show(sheet)
    await userEvent.click(within(rowOf(/^Pane casereccio/)).getByRole('button', { name: 'Add…' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save add' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(check(/^Pane casereccio/)).toBeChecked()
    expect(applyButton()).toHaveTextContent('Apply 6 changes')
    const row = rowOf(/^Pane casereccio/)
    expect(row).toHaveTextContent('ready')
    expect(within(row).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })
  it('Edit hands the saved draft back', async () => {
    show(sheet)
    await userEvent.click(within(rowOf(/^Pane casereccio/)).getByRole('button', { name: 'Add…' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save add' }))
    await userEvent.click(within(rowOf(/^Pane casereccio/)).getByRole('button', { name: 'Edit' }))
    expect(sheet.mock.calls.at(-1)![0].draft).toEqual(completeDraft)
  })
  it('an incomplete draft does not count and does not check the row', async () => {
    show(sheet)
    await userEvent.click(within(rowOf(/^Pane casereccio/)).getByRole('button', { name: 'Add…' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save incomplete' }))
    expect(check(/^Pane casereccio/)).not.toBeChecked()
    expect(applyButton()).toHaveTextContent('Apply 5 changes')
  })
  it('closing without saving changes nothing', async () => {
    show(sheet)
    await userEvent.click(within(rowOf(/^Bananas/)).getByRole('button', { name: 'Add…' }))
    expect(sheet.mock.calls.at(-1)![0].proposal.id).toBe('add:1')
    await userEvent.click(screen.getByRole('button', { name: 'Close add' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(check(/^Bananas/)).not.toBeChecked()
  })
  it('an Add that is not ready cannot be checked by hand', async () => {
    show(sheet)
    await userEvent.click(check(/^Pane casereccio/))
    expect(check(/^Pane casereccio/)).not.toBeChecked()
    expect(applyButton()).toHaveTextContent('Apply 5 changes')
  })
  it('the completed Add goes to the apply, with its choices', async () => {
    api.apply.mockResolvedValue({ ok: true, applied: 6, results: [] })
    show(sheet)
    await userEvent.click(within(rowOf(/^Pane casereccio/)).getByRole('button', { name: 'Add…' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save add' }))
    await userEvent.click(applyButton())
    const body = api.apply.mock.calls[0]![0]
    expect(body.accept.map((a: { id: string }) => a.id)).toContain('add:0')
    expect(body.adds).toEqual([{ id: 'add:0', ingredient: { id: 31 }, productName: 'Pane casereccio', packSize: 450 }])
  })
})

describe('Apply: success', () => {
  it('posts the body, goes back to /scan with the toast, and hands the results to the Scanned session', async () => {
    const results = [scanResult('receipt:rd-1:0'), scanResult('u1', 135)]
    api.apply.mockResolvedValue({ ok: true, applied: 5, results })
    show()
    await userEvent.click(applyButton())
    expect(api.apply).toHaveBeenCalledWith({
      readId: READ_ID, fingerprint: FINGERPRINT, clientUuids: UUIDS,
      accept: [{ id: 'price:0' }, { id: 'price:1' }, { id: 'price:2' }, { id: 'weight:3' }, { id: 'quantity:4' }],
      adds: [],
    })
    expect(await screen.findByText('scan page')).toBeInTheDocument()
    expect(screen.getByText('Applied 5 changes from the receipt')).toBeInTheDocument()
    expect(takePendingReceiptApplied()).toEqual({ readId: READ_ID, applied: 5, failed: false, results })
    expect(recallRead()).toBeUndefined()
  })
  it('one change reads "Applied 1 change from the receipt"', async () => {
    api.apply.mockResolvedValue({ ok: true, applied: 1, results: [] })
    show()
    await userEvent.click(applyButton())
    expect(await screen.findByText('Applied 1 change from the receipt')).toBeInTheDocument()
  })
  it('the button is busy while posting and a double press posts once', async () => {
    let release!: (v: unknown) => void
    api.apply.mockReturnValue(new Promise((r) => { release = r }))
    show()
    await userEvent.dblClick(applyButton())
    expect(api.apply).toHaveBeenCalledTimes(1)
    expect(applyButton()).toBeDisabled()
    release({ ok: true, applied: 5, results: [] })
    expect(await screen.findByText('scan page')).toBeInTheDocument()
  })
})

describe('Apply: refused or failed', () => {
  const press = async (outcome: unknown) => {
    api.apply.mockResolvedValue(outcome)
    show()
    await userEvent.click(applyButton())
    return await screen.findByRole('alert')
  }
  it('409 receipt_session_changed: "Your scans changed since the receipt was read", with Read again', async () => {
    const alert = await press(refused(409, 'receipt_session_changed'))
    expect(alert).toHaveTextContent('Your scans changed since the receipt was read')
    expect(screen.getByTestId('where')).toHaveTextContent('/scan/receipt/review')
    await userEvent.click(within(alert).getByRole('button', { name: 'Read again' }))
    expect(screen.getByText('photos page')).toBeInTheDocument()
    expect(recallRead()).toBeUndefined()
  })
  it('410 receipt_read_gone', async () => {
    const alert = await press(refused(410, 'receipt_read_gone'))
    expect(alert).toHaveTextContent('This read is no longer kept (10 minutes).')
    expect(within(alert).getByRole('button', { name: 'Read again' })).toBeInTheDocument()
  })
  it('409 receipt_read_not_done', async () => {
    expect(await press(refused(409, 'receipt_read_not_done'))).toHaveTextContent('The receipt is still being read.')
  })
  it('409 assistant_unavailable', async () => {
    expect(await press(refused(409, 'assistant_unavailable'))).toHaveTextContent("The Recipe Assistant isn't working. An Admin can check it in Settings.")
  })
  it('an Admin gets the link to the settings', async () => {
    me.isAdmin = true
    const alert = await press(refused(409, 'assistant_unavailable'))
    expect(within(alert).getByRole('link', { name: /Recipe Assistant settings/ })).toHaveAttribute('href', '/settings/recipe-assistant')
  })
  it('422 add_incomplete highlights the row by id and says what to do', async () => {
    const alert = await press(refused(422, 'add_incomplete', { id: 'add:0' }))
    expect(alert).toHaveTextContent('Choose the Ingredient and the Product name and pack size for this line first.')
    expect(rowOf(/^Pane casereccio/)).toHaveAttribute('data-highlighted', 'true')
    expect(rowOf(/^Bananas/)).not.toHaveAttribute('data-highlighted', 'true')
  })
  it('422 unknown_proposal highlights the row by id', async () => {
    const alert = await press(refused(422, 'unknown_proposal', { id: 'price:0' }))
    expect(alert).toHaveTextContent('That line is no longer on the receipt. Read the receipt again.')
    expect(rowOf(/^Mutti passata 700 g/)).toHaveAttribute('data-highlighted', 'true')
  })
  it('500 receipt_apply_failed: the error copy, still on the review, and the results handed over so the phone re-keys its rows', async () => {
    const results = [scanResult('receipt:rd-1:undo:u2'), scanResult('receipt:rd-1:undo:u5#2')]
    const alert = await press(refused(500, 'receipt_apply_failed', {}, results))
    expect(alert).toHaveTextContent('The receipt could not be applied. Check the Scanned list and try again.')
    expect(screen.getByTestId('where')).toHaveTextContent('/scan/receipt/review')
    expect(takePendingReceiptApplied()).toEqual({ readId: READ_ID, applied: 0, failed: true, results })
    expect(screen.queryByText(/Applied \d+ changes?/)).toBeNull()
  })
  it('a lost connection says so and Try again posts once more', async () => {
    const alert = await press(refused(0, 'network'))
    expect(alert).toHaveTextContent('Feeder could not be reached. Check your connection and try again.')
    api.apply.mockResolvedValue({ ok: true, applied: 5, results: [] })
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(api.apply).toHaveBeenCalledTimes(2)
    expect(await screen.findByText('scan page')).toBeInTheDocument()
  })
  it('the checked rows survive a refusal', async () => {
    await press(refused(409, 'receipt_session_changed'))
    expect(check(/^Mutti passata 700 g/)).toBeChecked()
    expect(applyButton()).toHaveTextContent('Apply 5 changes')
  })
})

describe('no read kept', () => {
  it('says the read is no longer kept and offers to read again', async () => {
    forgetRead()
    show()
    expect(screen.getByText(/no longer kept/)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Read the receipt' }))
    expect(screen.getByText('photos page')).toBeInTheDocument()
  })
})

describe('leaving', () => {
  it('Back with rows checked asks "Leave without applying?"; Leave goes to /scan and the read stays kept for its 10 minutes', async () => {
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    const dialog = await screen.findByRole('dialog', { name: 'Leave without applying?' })
    expect(dialog.tagName).toBe('DIALOG')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Leave' }))
    expect(screen.getByText('scan page')).toBeInTheDocument()
    expect(recallRead()?.readId).toBe(READ_ID)
  })
  it('Cancel stays on the review', async () => {
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    const dialog = await screen.findByRole('dialog', { name: 'Leave without applying?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Review the receipt' })).toBeInTheDocument()
  })
  it('Back with nothing checked leaves at once', async () => {
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Accept all' }))
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('scan page')).toBeInTheDocument()
  })
})
