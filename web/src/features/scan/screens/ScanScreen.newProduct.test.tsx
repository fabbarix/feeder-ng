// SR-int: the Scan screen mounts the new-Product sheet (NewProductSheet, 13.5) for an unknown barcode, and opens the Price
// keypad on the new row once it is added (mockup 10). The sheet itself is tested in components/NewProductSheet.*.test.tsx;
// here it is a fake that shows what the screen hands it. Replaces ScanScreen.picture.test (the old sheet's Picture field).
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeLine, makeList } from '../../shop/testData'
import type { NewProductSheetProps } from '../components/NewProductSheet'
import type { ScanController } from '../hooks/useScanController'
import type { ScanFlow } from '../hooks/useScanFlow'
import { buildScannedRows } from '../lib/scannedList'
import { okResult, passata, products as listProducts, scanOp } from '../lib/scannedList.testData'
import type { OfflineProduct } from '../types'

const controllerHook = vi.hoisted(() => ({ useScanController: vi.fn() }))
// Receipt reading: the assistant's status is not this file's concern; off, so the footer row stays hidden.
vi.mock('../../import/hooks/useReadAvailability', () => ({ useReadAvailability: () => ({ loading: false, enabled: false, isAdmin: false, photos: false, settingsLink: false, statusFailed: false, retry: () => {} }) }))
vi.mock('../hooks/useScanController', () => controllerHook)
vi.mock('../../shops/hooks/useShops', () => ({ useShops: () => ({ shops: [{ id: 2, name: 'Coop' }], isLoading: false, error: null, add: vi.fn() }) }))
vi.mock('../lib/lastShop', () => ({ getLastShopId: vi.fn(() => 2), setLastShopId: vi.fn(), LAST_SHOP_KEY: 'x' }))
const sheet = vi.hoisted(() => ({ props: null as NewProductSheetProps | null }))
vi.mock('../components/NewProductSheet', () => ({
  NewProductSheet: (p: NewProductSheetProps) => {
    sheet.props = p
    return <div role="dialog" aria-label="What is this?" />
  },
}))

import { ScanScreen } from './ScanScreen'

const flow = (over: Partial<ScanFlow> = {}): ScanFlow => ({
  pricing: null, startPriceEntry: vi.fn(), closePriceEntry: vi.fn(), savePrice: vi.fn(async () => ({ status: 'saved' as const })), increment: vi.fn(), decrement: vi.fn(), removeRow: vi.fn(), confirmRemove: vi.fn(), banner: null, sheet: null, paused: false, onScan: vi.fn(), saveUnknown: vi.fn(async () => {}), submitWeight: vi.fn(), stockTakeAction: vi.fn(),
  closeSheet: vi.fn(), applySyncResults: vi.fn(),
  unarchiveProduct: vi.fn(), unarchiving: false, createNewInstead: vi.fn(), ...over,
})
const products = [{ id: 7, name: 'Mutti passata 700 g', ingredientId: 1, packSize: 700 }] as unknown as OfflineProduct[]
const lines = [makeLine({ ingredientId: 11, name: 'Mozzarella', quantity: 125 })]
const controller = (over: Partial<ScanController> = {}): ScanController => ({
  status: 'ready', error: null,
  camera: { status: 'ready', videoRef: { current: null }, torchSupported: true, torchOn: false, toggleTorch: vi.fn() },
  recovery: { failure: null, manualOpen: false, openManual: vi.fn(), closeManual: vi.fn(), text: '', setText: vi.fn(), error: null, submit: vi.fn(() => true), retry: vi.fn() },
  muted: false, toggleMute: vi.fn(), canVibrate: true, scanned: { loaded: false, entries: [], rows: [], totals: { spentCents: 0, unpricedCount: 0 }, toGet: [], toGetCount: 0, nextUnpriced: () => null, record: vi.fn(), settle: vi.fn(), drop: vi.fn(), reprice: vi.fn(), update: vi.fn(), clear: vi.fn() }, endSession: vi.fn(), flow: flow(),
  list: makeList({ lines }),
  online: true, pendingCount: 0, rejectedCount: 0, dismissRejected: vi.fn(), notices: [], dismissNotice: vi.fn(),
  ingredients: [{ id: 1, name: 'passata', baseUnit: 'g' }], currency: 'USD', system: 'imperial', products, setPicturePicking: vi.fn(), ...over,
})
const open = (c: ScanController) => {
  controllerHook.useScanController.mockReturnValue(c)
  return render(<MemoryRouter initialEntries={['/scan']}><ScanScreen /></MemoryRouter>)
}
const unknown = { paused: true, sheet: { kind: 'unknown' as const, mode: 'pack' as const, target: { mode: 'pack' as const, code: '8001234567890' } } }

beforeEach(() => {
  controllerHook.useScanController.mockReset()
  sheet.props = null
})

describe('ScanScreen: the new-Product sheet', () => {
  it('an unknown barcode opens NewProductSheet with the barcode, the live Lines, the offline Products and the unit system', () => {
    const c = controller({ flow: flow(unknown) })
    open(c)
    expect(screen.getByRole('dialog', { name: 'What is this?' })).toBeInTheDocument()
    const p = sheet.props!
    expect(p.open).toBe(true)
    expect(p.mode).toBe('pack')
    expect(p.shopName).toBe('Coop')
    expect(p.barcode).toBe('8001234567890')
    expect(p.lines).toBe(c.list!.lines)
    expect(p.products).toBe(products)
    expect(p.system).toBe('imperial')
    expect(p.ingredients).toBe(c.ingredients)
  })

  it('the Picture stops and restarts the scanner stream through onPicturePicking', () => {
    const c = controller({ flow: flow(unknown) })
    open(c)
    sheet.props!.onPicturePicking!(true)
    expect(c.setPicturePicking).toHaveBeenCalledWith(true)
    sheet.props!.onPicturePicking!(false)
    expect(c.setPicturePicking).toHaveBeenCalledWith(false)
  })

  it('online the Picture is uploaded at once; offline it is kept for the queue (canUpload), and the guard looks up only online', () => {
    open(controller({ flow: flow(unknown) }))
    expect(sheet.props!.canUpload).toBe(true)
    expect(sheet.props!.findSimilar).toBeTypeOf('function')
    open(controller({ online: false, flow: flow(unknown) }))
    expect(sheet.props!.canUpload).toBe(false)
    expect(sheet.props!.findSimilar).toBeUndefined()
  })

  it('Add saves through the flow and waits for it (the sheet stays open on a failure)', async () => {
    const f = flow(unknown)
    open(controller({ flow: f }))
    const values = { clientUuid: 'u-new' } as Parameters<NewProductSheetProps['onSave']>[0]
    await sheet.props!.onSave(values)
    expect(f.saveUnknown).toHaveBeenCalledWith(values)
  })

  it('once added, the Price keypad opens on the new row (mockup 10)', () => {
    const f = flow(unknown)
    open(controller({ flow: f }))
    sheet.props!.onAdded!('new:u-new', 'u-new')
    expect(f.startPriceEntry).toHaveBeenCalledWith('new:u-new')
  })

  it('Close closes the sheet', () => {
    const f = flow(unknown)
    open(controller({ flow: f }))
    sheet.props!.onClose()
    expect(f.closeSheet).toHaveBeenCalled()
  })

  it('a weighed code with a Price passes that Price for its weight hint, and no barcode', () => {
    const weighed = { paused: true, sheet: { kind: 'unknown' as const, mode: 'weighed_price' as const, target: { mode: 'weighed_price' as const, ruleId: 1, itemCode: '12345', priceCents: 624 } } }
    open(controller({ flow: flow(weighed) }))
    expect(sheet.props!.mode).toBe('weighed_price')
    expect(sheet.props!.priceText).toBe('$6.24')
    expect(sheet.props!.barcode).toBeUndefined()
  })
})

describe('ScanScreen: the Price entry on a new Product\'s row', () => {
  // The scan that created the Product has its Result: the row is keyed by the Product id now, not new:<uuid>.
  const createdRow = buildScannedRows([{ op: { ...scanOp('u-new', passata), productId: undefined }, result: okResult(scanOp('u-new', passata), passata) }], listProducts)[0]!
  const scannedWith = (rows: typeof createdRow[]): ScanController['scanned'] => ({
    loaded: true, entries: [], rows, totals: { spentCents: 0, unpricedCount: rows.length }, toGet: [], toGetCount: 0, nextUnpriced: () => null,
    record: vi.fn(), settle: vi.fn(), drop: vi.fn(), reprice: vi.fn(), update: vi.fn(), clear: vi.fn(),
  })

  it('new:<uuid> finds the row after it re-keyed to the Product id: the keypad opens on it, outlined', () => {
    open(controller({ products: listProducts, scanned: scannedWith([createdRow]), flow: flow({ paused: true, pricing: { key: 'new:u-new' } }) }))
    expect(createdRow.key).toBe(String(passata.id))
    expect(screen.getByRole('dialog', { name: `Price of ${passata.name}` })).toHaveAttribute('data-modal', 'false')
    expect(document.querySelector(".list-row[data-pricing='true']")).not.toBeNull()
  })

  it('a Price entry whose row is gone (a rejected scan, an unarchive offer) closes, so the camera does not stay paused', () => {
    const f = flow({ paused: true, pricing: { key: 'new:u-gone' } })
    open(controller({ scanned: scannedWith([]), flow: f }))
    expect(f.closePriceEntry).toHaveBeenCalled()
  })
})
