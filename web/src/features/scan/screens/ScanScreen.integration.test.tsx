// SR4: the Scan screen through the real useScanController: a fake API, the in-memory queue and session stores (the same
// fixtures as hooks/useScanController.test.tsx). A barcode is "read" by calling the scanner's onScan.
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../ui/Toast'
import { makeLine, makeList } from '../../shop/testData'
import { parse } from '../lib/barcode'
import { createMemoryOpStore, createMemoryPictureStore } from '../lib/queue'
import { createSessionStore } from '../lib/sessionStore'
import { createMemorySnapshotStore } from '../lib/snapshots'
import { okResult, passata, products } from '../lib/scannedList.testData'
import type { OfflineData, Op, ScanResult } from '../types'

const h = vi.hoisted(() => ({
  invalidate: vi.fn(),
  request: vi.fn(),
  list: undefined as unknown,
  onScan: undefined as undefined | ((s: unknown) => void),
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
const offlineData: OfflineData = { shopId: 2, shopName: 'Coop', products, catalog: { globalBarcodes: { '08000500310427': 7 }, weightRules: [], weightProducts: {} } }
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
const open = () =>
  render(
    <MemoryRouter initialEntries={['/scan']}>
      <ToastProvider>
        <ScanScreen />
      </ToastProvider>
    </MemoryRouter>,
  )
const read = () => act(async () => void h.onScan!(parse('8000500310427', 'ean_13')))
const rowList = () => screen.getByRole('list', { name: 'Scanned list' })

beforeEach(() => {
  vi.clearAllMocks()
  h.sessionDb = createMemorySnapshotStore()
  h.list = makeList({ today: '2026-11-13', lines: [makeLine({ ingredientId: 2, name: 'Passata', quantity: 700 })], extras: [] })
  h.api.sync.mockImplementation(echo)
  h.api.undo.mockResolvedValue({ undone: true })
  h.api.setPrices.mockImplementation(async (b: { clientUuids: string[]; priceCents: number }) =>
    b.clientUuids.map((u) => ({ clientUuid: u, status: 'applied', scan: { ...okResult({ clientUuid: u } as Op, passata).scan!, priceCents: b.priceCents } })),
  )
})

describe('ScanScreen with the real controller', () => {
  it('starts empty; a scan becomes a row that says it is on the list, with an Add price button and the "Added" toast', async () => {
    open()
    expect(await screen.findByRole('heading', { name: 'Nothing scanned yet' })).toBeInTheDocument()
    await read()
    const row = (await within(await screen.findByRole('list', { name: 'Scanned list' })).findByRole('button', { name: 'Mutti passata 700 g' })).closest('li')!
    expect(row).toHaveTextContent('On the list · 700 g still to get')
    expect(within(row).getByRole('button', { name: /^Add price/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Scanned 1' })).toBeChecked()
    expect(await screen.findByText('Added Mutti passata 700 g')).toBeInTheDocument()
  })

  it('Undo on the toast takes the row away again, once', async () => {
    open()
    await screen.findByRole('heading', { name: 'Nothing scanned yet' })
    await read()
    await screen.findByText('Added Mutti passata 700 g')
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Nothing scanned yet' })).toBeInTheDocument())
    expect(h.api.undo).toHaveBeenCalledTimes(1)
  })

  it('Add price opens the keypad over the camera with "Last time here"; Save sends one PATCH and shows the Price and the total', async () => {
    open()
    await screen.findByRole('heading', { name: 'Nothing scanned yet' })
    await read()
    await userEvent.click(await screen.findByRole('button', { name: /^Add price/ }))
    expect(screen.getByRole('dialog', { name: 'Price of Mutti passata 700 g' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Scanner' })).toHaveAttribute('data-camera', 'paused')
    expect(screen.getByRole('button', { name: /Last time here \$1\.29/ })).toBeInTheDocument()
    for (const k of '145') await userEvent.click(screen.getByRole('button', { name: k }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(h.api.setPrices).toHaveBeenCalledTimes(1)
    expect(h.api.setPrices.mock.calls[0]![0]).toMatchObject({ priceCents: 145 })
    expect(within(rowList()).getByRole('button', { name: /^Price of Mutti passata 700 g/ })).toHaveTextContent('$1.45')
    expect(screen.getByText('$1.45', { selector: 'output, p, span, strong, b' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio').length).toBe(2)
    expect(screen.getByRole('region', { name: 'Scanner' })).toHaveAttribute('data-camera', 'on')
  })

  it('a rescan is ×2; Remove asks "Remove 2 Mutti passata 700 g?" and Remove undoes both scans', async () => {
    open()
    await screen.findByRole('heading', { name: 'Nothing scanned yet' })
    await read()
    await read()
    const mutti = await screen.findByRole('button', { name: 'Mutti passata 700 g' })
    await waitFor(() => expect(mutti.closest('li')).toHaveTextContent('×2'))
    await userEvent.click(mutti)
    await userEvent.click(screen.getByRole('button', { name: 'More for Mutti passata 700 g' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove' }))
    const dialog = await screen.findByRole('dialog', { name: 'Remove 2 Mutti passata 700 g?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(h.api.undo).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('heading', { name: 'Nothing scanned yet' })).toBeInTheDocument()
  })

  it('Remove of a single scan is at once, with "Removed <product>" and Put back', async () => {
    open()
    await screen.findByRole('heading', { name: 'Nothing scanned yet' })
    await read()
    await userEvent.click(await screen.findByRole('button', { name: 'Mutti passata 700 g' }))
    await userEvent.click(screen.getByRole('button', { name: 'More for Mutti passata 700 g' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove' }))
    expect(await screen.findByText('Removed Mutti passata 700 g')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Put back' })).toBeInTheDocument()
  })

  it('Change Shop empties the session: picking the same Shop again shows an empty Scanned list', async () => {
    open()
    await screen.findByRole('heading', { name: 'Nothing scanned yet' })
    await read()
    await screen.findByRole('button', { name: 'Mutti passata 700 g' })
    await waitFor(async () => expect((await createSessionStore(h.sessionDb as never).load(2, '2026-11-13')).length).toBe(1))
    await userEvent.click(screen.getByRole('button', { name: 'Change Shop' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Coop' }))
    expect(await screen.findByRole('heading', { name: 'Nothing scanned yet' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Scanned 0' })).toBeChecked()
    expect(await createSessionStore(h.sessionDb as never).load(2, '2026-11-13')).toEqual([])
  })
})
