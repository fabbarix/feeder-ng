// SR4: fakes shared by the Scan screen tests: a ScanFlow, a ScanController and a ScannedList built from the SR3 fixtures with
// the real pure functions (lib/scannedList), so the screen is tested against rows the session model really produces.
import { vi } from 'vitest'
import { makeExtra, makeLine, makeList } from '../../shop/testData'
import type { ScanController } from '../hooks/useScanController'
import type { ScanFlow } from '../hooks/useScanFlow'
import type { ScannedList } from '../hooks/useScannedList'
import { buildScannedRows, displayOrder, nextWithoutPrice, scannedTotals, toGetLines, type SessionEntry } from '../lib/scannedList'
import { applied, cheese, passata, products, toiletPaper } from '../lib/scannedList.testData'
import type { OfflineProduct } from '../types'

export function flowFake(over: Partial<ScanFlow> = {}): ScanFlow {
  return {
    banner: null,
    sheet: null,
    paused: false,
    pricing: null,
    onScan: vi.fn(),
    saveUnknown: vi.fn(),
    submitWeight: vi.fn(),
    stockTakeAction: vi.fn(),
    applySyncResults: vi.fn(),
    closeSheet: vi.fn(),
    unarchiveProduct: vi.fn(),
    unarchiving: false,
    createNewInstead: vi.fn(),
    startPriceEntry: vi.fn(),
    closePriceEntry: vi.fn(),
    savePrice: vi.fn(async () => ({ status: 'saved' as const })),
    increment: vi.fn(),
    decrement: vi.fn(),
    removeRow: vi.fn(),
    confirmRemove: vi.fn(),
    undo: vi.fn(),
    ...over,
  } as unknown as ScanFlow
}

export function scannedFake(entries: SessionEntry[] = [], offline: OfflineProduct[] = products): ScannedList {
  const rows = displayOrder(buildScannedRows(entries, offline))
  const toGet = toGetLines(makeList({ lines: [makeLine(), makeLine({ ingredientId: 5, name: 'Cheese', quantity: 200, pack: null })], extras: [makeExtra()] }), rows)
  return {
    loaded: true,
    entries,
    rows,
    totals: scannedTotals(rows),
    toGet,
    toGetCount: toGet.length,
    nextUnpriced: (current) => nextWithoutPrice(rows, current),
    record: vi.fn(),
    settle: vi.fn(),
    drop: vi.fn(),
    reprice: vi.fn(),
    update: vi.fn(),
    clear: vi.fn(),
  }
}

export function controllerFake(over: Partial<ScanController> = {}): ScanController {
  return {
    status: 'ready',
    error: null,
    camera: { status: 'ready', videoRef: { current: null }, torchSupported: true, torchOn: false, toggleTorch: vi.fn() },
    recovery: { failure: null, manualOpen: false, openManual: vi.fn(), closeManual: vi.fn(), text: '', setText: vi.fn(), error: null, submit: vi.fn(() => true), retry: vi.fn() },
    muted: false,
    toggleMute: vi.fn(),
    canVibrate: true,
    flow: flowFake(),
    scanned: scannedFake(),
    endSession: vi.fn(),
    list: makeList({ lines: [makeLine(), makeLine({ ingredientId: 5, name: 'Cheese', quantity: 200, pack: null })], extras: [makeExtra()] }),
    online: true,
    pendingCount: 0,
    rejectedCount: 0,
    dismissRejected: vi.fn(),
    notices: [],
    dismissNotice: vi.fn(),
    ingredients: [{ id: 1, name: 'passata', baseUnit: 'g' }],
    currency: 'USD',
    system: 'metric',
    product: (id: number) => products.find((p) => p.id === id),
    ...over,
  } as ScanController
}

/** The usual session, oldest scan first: two priced Mutti passata (on the list, ticked), a Regina toilet paper without a Price, a weighed cheese. */
export const sessionEntries = (): SessionEntry[] => [
  applied('u-1', passata, { priceCents: 129 }, { priceCents: 129, onList: true, ticked: true, remaining: 0 }),
  applied('u-2', passata, { priceCents: 129 }, { priceCents: 129, onList: true, ticked: true, remaining: 0 }),
  applied('u-3', toiletPaper, {}, { onList: false }),
  applied('u-4', cheese, { quantity: 312, weighed: true, priceCents: 624, pricePerKgCents: 2000 }, { quantity: 312, priceCents: 624, onList: true, remaining: 0, ticked: true }),
]
