// Receipt reading end to end on the web side (receipt-reading.md 3, 7): the Scan screen through the real useScanController, the
// receipt routes through their real hooks, over a fake Scan API and a fake receipt API. Scan a barcode, press "Read the receipt",
// add a photo, read it (the fake read reaches done), review, add a "Not scanned" line through the new-Product sheet, apply, and
// the Scanned list shows the new Price and the added Product.
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '../../../ui'
import { ToastProvider } from '../../../ui/Toast'
import { makeList } from '../../shop/testData'
import { proposal } from '../../receipt/fixtures.test-helper'
import { publishReceiptSession } from '../../receipt/lib/receiptSession'
import { forgetRead } from '../../receipt/lib/readStore'
import type { ApplyBody, ReadDone, StartReadBody } from '../../receipt/types'
import { parse } from '../lib/barcode'
import { createMemoryOpStore, createMemoryPictureStore } from '../lib/queue'
import { createMemorySnapshotStore } from '../lib/snapshots'
import { appliedScan, okResult, passata as pricedPassata, toiletPaper } from '../lib/scannedList.testData'
import type { OfflineData, Op, ScanResult } from '../types'

const h = vi.hoisted(() => ({
  invalidate: vi.fn(),
  request: vi.fn(),
  list: undefined as unknown,
  onScan: undefined as undefined | ((s: unknown) => void),
  api: { sync: vi.fn(), undo: vi.fn(), setPrice: vi.fn(), setPrices: vi.fn(), uploadPicture: vi.fn(), findArchived: vi.fn(), product: vi.fn(), unarchiveProduct: vi.fn() },
  receipt: { startRead: vi.fn(), getRead: vi.fn(), cancelRead: vi.fn(), apply: vi.fn() },
  sessionDb: undefined as unknown,
}))

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: h.invalidate }) }))
vi.mock('../../shop/lib/liveRefresh', () => ({ liveRefreshFor: () => ({ request: h.request }) }))
vi.mock('../../shop/hooks/useShoppingList', () => ({ useShoppingList: () => ({ data: h.list }) }))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../products/hooks/useCurrency', () => ({ useCurrency: () => 'USD' }))
vi.mock('../../stock/hooks/useIngredientChoices', () => ({ useIngredientChoices: () => ({ choices: [{ id: 31, name: 'Bread', baseUnit: 'g' }], isLoading: false }) }))
vi.mock('../../stock/hooks/useStock', () => ({ useStockTotals: () => ({ data: [] }) }))
vi.mock('../../../app/useMe', () => ({ useMe: () => ({ data: { isAdmin: false } }) }))
vi.mock('../../import/hooks/useReadAvailability', () => ({
  useReadAvailability: () => ({ loading: false, enabled: true, isAdmin: false, photos: true, settingsLink: false, statusFailed: false, retry: () => {} }),
}))
vi.mock('../api', () => ({ scanApi: h.api }))
vi.mock('../../receipt/api', () => ({ receiptApi: h.receipt }))
// The photo pipeline needs a canvas: a photo is "prepared" as it is.
vi.mock('../../receipt/lib/preparePhoto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../receipt/lib/preparePhoto')>()),
  prepareReceiptPhoto: async (file: Blob) => ({ blob: file, dataUrl: 'data:image/jpeg;base64,AAAA', width: 1500, height: 2000 }),
}))
// The read is polled every 1.5 s; here at once.
vi.mock('../../receipt/lib/readPolling', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../receipt/lib/readPolling')>()), POLL_INTERVAL_MS: 5 }))
vi.mock('../hooks/useCamera', () => ({
  useCamera: () => ({ status: 'ready', videoRef: { current: null }, torchSupported: false, torchOn: false, toggleTorch: vi.fn(), frame: vi.fn(), retry: vi.fn() }),
}))
vi.mock('../hooks/useCameraRecovery', () => ({ useCameraRecovery: () => ({ failure: null, manualOpen: false, openManual: vi.fn(), closeManual: vi.fn(), text: '', setText: vi.fn(), error: null, submit: vi.fn(), retry: vi.fn() }) }))
vi.mock('../hooks/useScanner', () => ({
  useScanner: (o: { onScan: (s: unknown) => void }) => {
    h.onScan = o.onScan
    return { error: null }
  },
}))
vi.mock('../lib/detector', () => ({ chooseDetector: async () => ({}) }))
vi.mock('../lib/zxingDetector', () => ({ createZxingDetector: vi.fn() }))
vi.mock('../lib/feedback', () => ({
  webAudioBeep: () => vi.fn(),
  createFeedback: () => ({ confirm: vi.fn(), reject: vi.fn(), isMuted: () => false, setMuted: vi.fn(), canVibrate: false }),
}))
const { lastPriceDate: _unused, ...unpriced } = pricedPassata
const passata = { ...unpriced, lastPriceCents: null }
const offlineData: OfflineData = { shopId: 2, shopName: 'Coop', products: [passata, toiletPaper], catalog: { globalBarcodes: { '08000500310427': 7 }, weightRules: [], weightProducts: {} } }
vi.mock('../hooks/useOfflineData', () => ({ useOfflineData: () => ({ offline: offlineData, status: 'ready', error: null }) }))
vi.mock('../lib/idbStore', async () => {
  const ops = createMemoryOpStore()
  const pictures = createMemoryPictureStore()
  return { appOpStore: () => ops, appPictureStore: () => pictures, appSnapshots: () => createMemorySnapshotStore() }
})
vi.mock('../lib/sessionStore', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/sessionStore')>()
  return { ...real, appSessionStore: () => real.createSessionStore(h.sessionDb as ReturnType<typeof createMemorySnapshotStore>) }
})
vi.mock('../../shops/hooks/useShops', () => ({ useShops: () => ({ shops: [{ id: 2, name: 'Coop' }], isLoading: false, error: null, add: vi.fn() }) }))
vi.mock('../../shops/hooks/useNearestShop', () => ({ useNearestShop: () => ({ nearest: null, status: 'idle', position: null, failure: null, anyLocated: true, locate: vi.fn() }) }))
vi.mock('../lib/lastShop', () => ({ getLastShopId: () => 2, setLastShopId: vi.fn(), LAST_SHOP_KEY: 'x' }))

import { ReceiptPhotosScreen } from '../../receipt/screens/ReceiptPhotosScreen'
import { ReceiptReviewRoute } from '../../receipt/screens/ReceiptReviewRoute'
import { ScanScreen } from './ScanScreen'

const echo = async (ops: Op[]): Promise<ScanResult[]> => ops.map((op) => okResult(op, passata))

/** The read of the mock-up's receipt: the passata's Price, and a bread the phone did not scan. */
const done = (): ReadDone => ({
  status: 'done',
  fingerprint: 'fp-1',
  rows: [{ row: 0, productId: 7, product: 'Mutti passata 700 g', barcode: '08000500310427', baseUnit: 'g', packSize: 700, scans: 1, quantity: 700, weighed: false, priceCents: 0, perKgCents: 0 }],
  proposals: [
    proposal({ id: 'price:0', kind: 'price', row: 0, text: 'MUTTI PASSATA 700G 1,35', checked: true, after: { priceCents: 135 } }),
    proposal({ id: 'add:0', kind: 'add', line: 1, text: 'PANE CASERECCIO 0,45 kg 2,25', needsInput: true, after: { name: 'Pane casereccio', grams: 450, priceCents: 225 } }),
  ],
  notes: [],
  totals: { scannedCents: 0, projectedCents: 360, receiptCents: 360, lines: 2 },
  warnings: [],
})

const bread = { ...toiletPaper, id: 40, name: 'Pane casereccio', ingredientId: 31, ingredientName: 'Bread', baseUnit: 'g' as const, packSize: 450, ingredientKind: 'food' as const }

function open() {
  return render(
    <MemoryRouter initialEntries={['/scan']}>
      <ToastProvider>
        <ConfirmProvider>
          <Routes>
            <Route path="/scan" element={<ScanScreen />} />
            <Route path="/scan/receipt" element={<ReceiptPhotosScreen />} />
            <Route path="/scan/receipt/review" element={<ReceiptReviewRoute />} />
          </Routes>
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}
const rowList = () => screen.getByRole('list', { name: 'Scanned list' })

beforeEach(() => {
  vi.clearAllMocks()
  h.sessionDb = createMemorySnapshotStore()
  h.list = makeList({ today: '2026-11-13', lines: [], extras: [] })
  h.api.sync.mockImplementation(echo)
  h.receipt.startRead.mockResolvedValue({ id: 'rd-1' })
  h.receipt.getRead.mockResolvedValueOnce({ status: 'running' }).mockResolvedValue(done())
  h.receipt.cancelRead.mockResolvedValue(undefined)
  URL.createObjectURL = vi.fn(() => 'blob:receipt/1')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  publishReceiptSession(undefined)
  forgetRead()
})

describe('Read the receipt, from the Scanned list and back', () => {
  it('scan, read a photo of the receipt, review with an Add, apply: the Scanned list has the new Price and the added Product', async () => {
    open()
    await screen.findByRole('heading', { name: 'Nothing scanned yet' })
    await act(async () => void h.onScan!(parse('8000500310427', 'ean_13')))
    await within(await screen.findByRole('list', { name: 'Scanned list' })).findByRole('button', { name: 'Mutti passata 700 g' })
    const scanUuid = (h.api.sync.mock.calls[0]![0] as Op[])[0]!.clientUuid

    // The footer row, after the list; it hands the session over and opens the photos.
    const footer = within(await screen.findByRole('list', { name: 'Receipt' }))
    expect(footer.getByText('Fill in Prices and weighed amounts from a photo')).toBeInTheDocument()
    await userEvent.click(footer.getByRole('button', { name: /Read the receipt/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Read the receipt' })).toBeInTheDocument()

    // One photo, then the read; the fake read is running once, then done, and the review opens.
    await userEvent.upload(document.querySelector<HTMLInputElement>('input[type=file]')!, new File([new Uint8Array(8)], 'receipt.jpg', { type: 'image/jpeg' }))
    await screen.findByText('Photos (1 of up to 4)')
    await userEvent.click(screen.getByRole('button', { name: 'Read the receipt' }))
    expect(h.receipt.startRead).toHaveBeenCalledWith({ shopId: 2, clientUuids: [scanUuid], photos: [{ dataUrl: 'data:image/jpeg;base64,AAAA' }] } satisfies StartReadBody)
    expect(await screen.findByRole('heading', { level: 1, name: 'Review the receipt' }, { timeout: 3000 })).toBeInTheDocument()

    // Add… on the Not scanned line: the new-Product sheet without a barcode, opened with the line's name and weight.
    await userEvent.click(screen.getByRole('button', { name: 'Add…' }))
    const sheet = screen.getByRole('dialog', { name: 'What is this?' })
    expect(within(sheet).queryByText(/not in Feeder yet/)).toBeNull()
    await userEvent.click(within(sheet).getByRole('combobox', { name: /Ingredient/ }))
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: /^Bread/ }))
    await userEvent.click(within(sheet).getByRole('button', { name: /^Add/ }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'What is this?' })).toBeNull())
    expect(h.api.sync).toHaveBeenCalledTimes(1) // the sheet sent no Op

    // Apply: the server re-prices the scan and makes the bread's scan.
    const breadScan: ScanResult = { clientUuid: 'receipt:rd-1:0', status: 'applied', scan: appliedScan(bread, { priceCents: 225, productCreated: true }) }
    const repriced: ScanResult = { clientUuid: scanUuid, status: 'applied', scan: appliedScan(passata, { priceCents: 135 }) }
    h.receipt.apply.mockResolvedValue({ ok: true, applied: 2, results: [repriced, breadScan], undone: [] })
    await userEvent.click(screen.getByRole('button', { name: 'Apply 2 changes' }))
    expect(h.receipt.apply.mock.calls[0]![0]).toEqual({
      readId: 'rd-1',
      fingerprint: 'fp-1',
      clientUuids: [scanUuid],
      accept: [{ id: 'price:0' }, { id: 'add:0' }],
      adds: [{ id: 'add:0', ingredient: { id: 31 }, productName: 'Pane casereccio', packSize: 450, scope: 'global' }],
    } satisfies ApplyBody)

    // Back on the Scanned list: the toast, the passata at its new Price, the bread as a new row, the live list asked again.
    expect(await screen.findByText('Applied 2 changes from the receipt')).toBeInTheDocument()
    const passataRow = (await within(await screen.findByRole('list', { name: 'Scanned list' })).findByRole('button', { name: 'Mutti passata 700 g' })).closest('li')!
    await waitFor(() => expect(passataRow.querySelector('.list-row__value')).toHaveTextContent('$1.35'))
    const breadRow = within(rowList()).getByRole('button', { name: 'Pane casereccio' }).closest('li')!
    expect(breadRow.querySelector('.list-row__value')).toHaveTextContent('$2.25')
    expect(document.querySelector('.scan-screen__amount')).toHaveTextContent(/^\$3\.60$/)
    expect(h.request).toHaveBeenCalled()
  })

  it('a failed apply re-keys the put-back scan: the row stays, and the next read starts from the new uuid', async () => {
    open()
    await screen.findByRole('heading', { name: 'Nothing scanned yet' })
    await act(async () => void h.onScan!(parse('8000500310427', 'ean_13')))
    await within(await screen.findByRole('list', { name: 'Scanned list' })).findByRole('button', { name: 'Mutti passata 700 g' })
    const scanUuid = (h.api.sync.mock.calls[0]![0] as Op[])[0]!.clientUuid
    await userEvent.click(await screen.findByRole('button', { name: /Read the receipt/ }))
    await userEvent.upload(document.querySelector<HTMLInputElement>('input[type=file]')!, new File([new Uint8Array(8)], 'receipt.jpg', { type: 'image/jpeg' }))
    await screen.findByText('Photos (1 of up to 4)')
    await userEvent.click(screen.getByRole('button', { name: 'Read the receipt' }))
    await screen.findByRole('heading', { level: 1, name: 'Review the receipt' }, { timeout: 3000 })

    const back = `receipt:rd-1:undo:${scanUuid}`
    h.receipt.apply.mockResolvedValue({ ok: false, status: 500, code: 'receipt_apply_failed', message: 'x', results: [{ clientUuid: back, status: 'applied', scan: appliedScan(passata) }] })
    await userEvent.click(screen.getByRole('button', { name: 'Apply 1 change' }))
    expect(await screen.findByText(/could not be applied|went wrong|try again/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Leave without applying?' })).getByRole('button', { name: 'Leave' }))
    await within(await screen.findByRole('list', { name: 'Scanned list' })).findByRole('button', { name: 'Mutti passata 700 g' })
    await userEvent.click(await screen.findByRole('button', { name: /Read the receipt/ }))
    await userEvent.upload(document.querySelector<HTMLInputElement>('input[type=file]')!, new File([new Uint8Array(8)], 'receipt.jpg', { type: 'image/jpeg' }))
    await screen.findByText('Photos (1 of up to 4)')
    await userEvent.click(screen.getByRole('button', { name: 'Read the receipt' }))
    expect(h.receipt.startRead.mock.calls[1]![0]).toMatchObject({ clientUuids: [back] })
  })
})
