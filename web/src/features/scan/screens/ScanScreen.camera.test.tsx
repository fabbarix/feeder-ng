// B9-35 (SSP-06, SSP-12): the Scan screen without a working camera, with one, and while the Price keypad is open. The real
// useScanController, useCameraRecovery and Toast; only the camera, the scanner, the API and the stores are faked (as in
// ScanScreen.integration.test.tsx). The chapter's component tests:
//   - the field is focused on open; it stays focused and clears after Use; the camera bar replaces the strip on failure;
//   - SSP-12: no toast while pricing; the Scan that opened the keypad has no toast; Type a barcode is disabled with "Close the Price first".
// Toasts are looked up in .toast-region by their own markup, never with an unscoped getByRole('alert'|'status'): the ToastProvider always
// mounts empty live regions, and the camera bar has its own alert.
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider, useToast } from '../../../ui/Toast'
import { makeLine, makeList } from '../../shop/testData'
import { createMemoryOpStore, createMemoryPictureStore } from '../lib/queue'
import { createMemorySnapshotStore } from '../lib/snapshots'
import { cheese, okResult, passata as pricedPassata, toiletPaper } from '../lib/scannedList.testData'
import type { OfflineData, Op, ScanResult } from '../types'

const h = vi.hoisted(() => ({
  invalidate: vi.fn(),
  request: vi.fn(),
  list: undefined as unknown,
  camera: { status: 'ready' as string, retry: vi.fn() },
  api: { sync: vi.fn(), undo: vi.fn(), setPrice: vi.fn(), setPrices: vi.fn(), uploadPicture: vi.fn(), findArchived: vi.fn(), product: vi.fn(), unarchiveProduct: vi.fn() },
  sessionDb: undefined as unknown,
}))

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: h.invalidate }) }))
vi.mock('../../shop/lib/liveRefresh', () => ({ liveRefreshFor: () => ({ request: h.request }) }))
vi.mock('../../shop/hooks/useShoppingList', () => ({ useShoppingList: () => ({ data: h.list }) }))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../products/hooks/useCurrency', () => ({ useCurrency: () => 'USD' }))
vi.mock('../../stock/hooks/useIngredientChoices', () => ({ useIngredientChoices: () => ({ choices: [], isLoading: false }) }))
vi.mock('../../stock/hooks/useStock', () => ({ useStockTotals: () => ({ data: [] }) }))
vi.mock('../api', () => ({ scanApi: h.api }))
vi.mock('../../import/hooks/useReadAvailability', () => ({ useReadAvailability: () => ({ loading: false, enabled: false, isAdmin: false, photos: false, settingsLink: false, statusFailed: false, retry: () => {} }) }))
vi.mock('../hooks/useCamera', () => ({
  useCamera: () => ({ status: h.camera.status, videoRef: { current: null }, torchSupported: false, torchOn: false, toggleTorch: vi.fn(), frame: vi.fn(), retry: h.camera.retry }),
}))
vi.mock('../hooks/useScanner', () => ({ useScanner: () => ({ error: null }) }))
vi.mock('../lib/detector', () => ({ chooseDetector: async () => ({}) }))
vi.mock('../lib/zxingDetector', () => ({ createZxingDetector: vi.fn() }))
vi.mock('../lib/feedback', () => ({
  webAudioBeep: () => vi.fn(),
  createFeedback: () => ({ confirm: vi.fn(), reject: vi.fn(), isMuted: () => false, setMuted: vi.fn(), canVibrate: false }),
}))
const { lastPriceDate: _unused, ...unpriced } = pricedPassata
const passata = { ...unpriced, lastPriceCents: null }
const offlineData: OfflineData = { shopId: 2, shopName: 'Coop', products: [passata, toiletPaper, cheese], catalog: { globalBarcodes: { '08000500310427': 7 }, weightRules: [], weightProducts: {} } }
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

import { ScanScreen } from './ScanScreen'

const echo = async (ops: Op[]): Promise<ScanResult[]> => ops.map((op) => okResult(op, passata, { onList: true, remaining: 700 }))
const toastApi: { api?: ReturnType<typeof useToast> } = {}
function Grab() {
  toastApi.api = useToast()
  return null
}
function open(entry = '/scan') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ToastProvider>
        <Grab />
        <ScanScreen />
      </ToastProvider>
    </MemoryRouter>,
  )
}
const scanner = () => screen.getByRole('region', { name: 'Scanner' })
const field = () => screen.getByRole('textbox', { name: 'Barcode' })
const typeInto = async (code: string) => {
  await userEvent.type(field(), `${code}{Enter}`)
}
/** Visible toasts by title; the empty live regions of the provider are not toasts. */
const toastTitles = () => [...document.querySelectorAll('.toast .toast__title-text')].map((e) => e.textContent)
const MUTTI = 'Mutti passata 700 g'

beforeEach(() => {
  vi.clearAllMocks()
  h.camera.status = 'ready'
  h.sessionDb = createMemorySnapshotStore()
  h.list = makeList({ today: '2026-11-13', lines: [makeLine({ ingredientId: 2, name: 'Passata', quantity: 700 })], extras: [] })
  h.api.sync.mockImplementation(echo)
  h.api.undo.mockResolvedValue({ undone: true })
  h.api.setPrices.mockImplementation(async (b: { clientUuids: string[]; priceCents: number }) =>
    b.clientUuids.map((u) => ({ clientUuid: u, status: 'applied', scan: { ...okResult({ clientUuid: u } as Op, passata).scan!, priceCents: b.priceCents } })),
  )
  Element.prototype.scrollIntoView = vi.fn()
})

describe('SSP-06: no camera', () => {
  beforeEach(() => {
    h.camera.status = 'no_camera'
  })

  it('the camera bar replaces the viewfinder strip: the Scanner region is size bar with the reason as its one alert', async () => {
    open()
    await screen.findByRole('heading', { name: 'Nothing scanned yet' })
    expect(scanner()).toHaveAttribute('data-size', 'bar')
    expect(document.querySelector('.viewfinder-strip__picture, video')).toBeNull()
    expect(within(scanner()).getByRole('alert')).toHaveTextContent('No camera on this device')
    expect(within(scanner()).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('a blocked camera says "Feeder may not use the camera"; Try again asks the camera again', async () => {
    h.camera.status = 'denied'
    open()
    await screen.findByRole('heading', { name: 'Nothing scanned yet' })
    expect(within(scanner()).getByRole('alert')).toHaveTextContent('Feeder may not use the camera')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(h.camera.retry).toHaveBeenCalledTimes(1)
  })

  it('the typed entry is open under the bar at once: the Barcode field and Use, no "Type the barcode instead"', async () => {
    open()
    await screen.findByRole('heading', { name: 'Nothing scanned yet' })
    const bar = scanner()
    const entry = document.querySelector('[data-typed-entry]')!
    expect(entry).not.toBeNull()
    expect(bar.compareDocumentPosition(entry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(field()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use this barcode' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /type the barcode instead/i })).toBeNull()
  })

  it('there is no Type a barcode button and no Back to the camera: nothing to switch to', async () => {
    open()
    await screen.findByRole('heading', { name: 'Nothing scanned yet' })
    expect(screen.queryByRole('button', { name: 'Type a barcode' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Back to the camera' })).toBeNull()
  })

  it('the empty state says to type the digits', async () => {
    open()
    expect(await screen.findByText('Type the digits under the bars. Lines to get are under To get.')).toBeInTheDocument()
    expect(screen.queryByText(/Point the camera/)).toBeNull()
  })

  it('Use adds the row, clears the field and keeps focus, so several codes can be typed', async () => {
    open()
    await screen.findByRole('heading', { name: 'Nothing scanned yet' })
    await typeInto('8000500310427')
    const row = await screen.findByRole('button', { name: MUTTI })
    expect(row.closest('li')).not.toBeNull()
    expect(field()).toHaveValue('')
    expect(field()).toHaveFocus()
    await typeInto('8000500310427')
    await waitFor(() => expect(screen.getByRole('button', { name: MUTTI }).closest('li')).toHaveTextContent('×2'))
    expect(field()).toHaveFocus()
  })

  it('the newest row is scrolled into view above the bottom bar after Use', async () => {
    open()
    await screen.findByRole('heading', { name: 'Nothing scanned yet' })
    await typeInto('8000500310427')
    const li = (await screen.findByRole('button', { name: MUTTI })).closest('li')!
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled())
    const ctx = (Element.prototype.scrollIntoView as unknown as { mock: { contexts: unknown[] } }).mock.contexts
    expect(ctx).toContain(li)
  })

  it('the Added toasts are one at a time: a second Use replaces the first, and the toast has Undo and no status icon', async () => {
    open()
    await screen.findByRole('heading', { name: 'Nothing scanned yet' })
    await typeInto('8000500310427')
    await screen.findByText(`Added ${MUTTI}`)
    await typeInto('8000500310427')
    await waitFor(() => expect(screen.getByRole('button', { name: MUTTI }).closest('li')).toHaveTextContent('×2'))
    expect(toastTitles()).toEqual([`Added ${MUTTI}`])
    const toast = document.querySelector('.toast')!
    expect(toast.querySelector('.toast__title svg')).toBeNull()
    expect(within(toast as HTMLElement).getByRole('button', { name: `Undo: Added ${MUTTI}` })).toHaveTextContent('Undo')
    expect(within(toast as HTMLElement).getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
  })

  it('"+1 without a Price" beside the total is an outlined secondary button, not bare text', async () => {
    open()
    await screen.findByRole('heading', { name: 'Nothing scanned yet' })
    await typeInto('8000500310427')
    expect(await screen.findByRole('button', { name: /^\+1 without a Price$/ })).toHaveAttribute('data-variant', 'secondary')
  })

  it('Stock-take uses the same bar and typed entry (the strip is shared)', async () => {
    open('/scan?mode=stocktake')
    expect(await screen.findByRole('heading', { name: 'Stock-take at home' })).toBeInTheDocument()
    expect(scanner()).toHaveAttribute('data-size', 'bar')
    expect(field()).toBeInTheDocument()
  })

  it('when Try again brings the camera back the strip returns and the entry is closed', async () => {
    const view = open()
    await screen.findByRole('heading', { name: 'Nothing scanned yet' })
    h.camera.status = 'ready'
    view.rerender(
      <MemoryRouter initialEntries={['/scan']}>
        <ToastProvider>
          <Grab />
          <ScanScreen />
        </ToastProvider>
      </MemoryRouter>,
    )
    await waitFor(() => expect(scanner()).not.toHaveAttribute('data-size', 'bar'))
    expect(screen.queryByRole('textbox', { name: 'Barcode' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Type a barcode' })).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('SSP-06: a camera that works', () => {
  it('has no camera bar and no typed entry; Type a barcode sits in the strip\'s control row with Mute', async () => {
    open()
    await screen.findByRole('heading', { name: 'Nothing scanned yet' })
    expect(scanner()).not.toHaveAttribute('data-size', 'bar')
    expect(screen.queryByRole('textbox', { name: 'Barcode' })).toBeNull()
    const controls = scanner().querySelector('.viewfinder-strip__controls')!
    expect(controls).toContainElement(screen.getByRole('button', { name: 'Type a barcode' }))
    expect(controls).toContainElement(screen.getByRole('button', { name: 'Mute beep' }))
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.getByText('Point the camera at a barcode. Lines to get are under To get.')).toBeInTheDocument()
  })

  it('Type a barcode opens the entry under the strip and focuses the field; it has aria-expanded and aria-controls', async () => {
    open()
    await screen.findByRole('heading', { name: 'Nothing scanned yet' })
    const toggle = screen.getByRole('button', { name: 'Type a barcode' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(field()).toHaveFocus()
    const entry = document.querySelector('[data-typed-entry]')!
    expect(toggle.getAttribute('aria-controls')).toBe(entry.id)
    expect(scanner().compareDocumentPosition(entry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('Back to the camera closes the entry and returns focus to Type a barcode', async () => {
    open()
    await screen.findByRole('heading', { name: 'Nothing scanned yet' })
    const toggle = screen.getByRole('button', { name: 'Type a barcode' })
    await userEvent.click(toggle)
    await userEvent.click(screen.getByRole('button', { name: 'Back to the camera' }))
    expect(screen.queryByRole('textbox', { name: 'Barcode' })).toBeNull()
    expect(toggle).toHaveFocus()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('a code typed beside a working camera becomes a row, like a read one', async () => {
    open()
    await screen.findByRole('heading', { name: 'Nothing scanned yet' })
    await userEvent.click(screen.getByRole('button', { name: 'Type a barcode' }))
    await typeInto('8000500310427')
    expect(await screen.findByRole('button', { name: MUTTI })).toBeInTheDocument()
    expect(field()).toHaveFocus()
  })
})

describe('SSP-12: the Price keypad', () => {
  const addPrice = async () => userEvent.click(await screen.findByRole('button', { name: /^Add price/ }))

  it('Type a barcode is disabled with the description "Close the Price first" while the keypad is open', async () => {
    open()
    await screen.findByRole('heading', { name: 'Nothing scanned yet' })
    await userEvent.click(screen.getByRole('button', { name: 'Type a barcode' }))
    await typeInto('8000500310427')
    await addPrice()
    await screen.findByRole('dialog', { name: `Price of ${MUTTI}` })
    const toggle = screen.getByRole('button', { name: 'Type a barcode' })
    expect(toggle).toBeDisabled()
    const desc = document.getElementById(toggle.getAttribute('aria-describedby')!.split(' ').pop()!)
    expect(desc).toHaveTextContent('Close the Price first')
  })

  it('an open typed entry closes while the keypad is open and stays closed after (camera works)', async () => {
    open()
    await screen.findByRole('heading', { name: 'Nothing scanned yet' })
    await userEvent.click(screen.getByRole('button', { name: 'Type a barcode' }))
    await typeInto('8000500310427')
    await addPrice()
    await screen.findByRole('dialog', { name: `Price of ${MUTTI}` })
    expect(screen.queryByRole('textbox', { name: 'Barcode' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByRole('textbox', { name: 'Barcode' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Type a barcode' })).toBeEnabled()
  })

  it('no camera: the entry is hidden while the keypad is open and comes back after it', async () => {
    h.camera.status = 'no_camera'
    open()
    await screen.findByRole('heading', { name: 'Nothing scanned yet' })
    await typeInto('8000500310427')
    await addPrice()
    await screen.findByRole('dialog', { name: `Price of ${MUTTI}` })
    expect(screen.queryByRole('textbox', { name: 'Barcode' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(field()).toBeInTheDocument()
  })

  it('the keypad footer is Close and the primary; there is no header Close (R-B)', async () => {
    open()
    await screen.findByRole('heading', { name: 'Nothing scanned yet' })
    await userEvent.click(screen.getByRole('button', { name: 'Type a barcode' }))
    await typeInto('8000500310427')
    await addPrice()
    const dialog = await screen.findByRole('dialog', { name: `Price of ${MUTTI}` })
    expect(within(dialog).getAllByRole('button', { name: 'Close' })).toHaveLength(1)
    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveAttribute('data-variant', 'secondary')
    expect(dialog.querySelector('.close-button')).toBeNull()
  })

  it('the Added toast of the Scan that opened the keypad is dropped, and does not come back when the keypad closes', async () => {
    open()
    await screen.findByRole('heading', { name: 'Nothing scanned yet' })
    await userEvent.click(screen.getByRole('button', { name: 'Type a barcode' }))
    await typeInto('8000500310427')
    await screen.findByText(`Added ${MUTTI}`)
    await addPrice()
    await screen.findByRole('dialog', { name: `Price of ${MUTTI}` })
    await waitFor(() => expect(toastTitles()).toEqual([]))
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(toastTitles()).toEqual([])
  })

  it('a toast that arrives while the keypad is open is held, and only the latest shows when it closes', async () => {
    open()
    await screen.findByRole('heading', { name: 'Nothing scanned yet' })
    await userEvent.click(screen.getByRole('button', { name: 'Type a barcode' }))
    await typeInto('8000500310427')
    await addPrice()
    await screen.findByRole('dialog', { name: `Price of ${MUTTI}` })
    act(() => void toastApi.api!.show('First news'))
    act(() => void toastApi.api!.show('Latest news'))
    expect(toastTitles()).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(toastTitles()).toEqual(['Latest news']))
  })

  it('an error is never held: it shows over the open keypad', async () => {
    open()
    await screen.findByRole('heading', { name: 'Nothing scanned yet' })
    await userEvent.click(screen.getByRole('button', { name: 'Type a barcode' }))
    await typeInto('8000500310427')
    await addPrice()
    await screen.findByRole('dialog', { name: `Price of ${MUTTI}` })
    act(() => void toastApi.api!.show({ status: 'error', title: 'Could not sync' }))
    expect(toastTitles()).toEqual(['Could not sync'])
  })
})
