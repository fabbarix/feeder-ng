// SR4: the Split Scan screen (shop-scan-proposals.md 13.2 to 13.6): camera strip over the Scanned list, the Segmented
// "Scanned N · To get N", the total and "+N without a Price", the Price entry sheet, the Remove confirm, Change Shop.
// The controller is a fake (screens/scanScreen.testKit.tsx); the integration tests are in ScanScreen.integration.test.tsx.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatMinor } from '../../products/lib/money'
import type { ScanController } from '../hooks/useScanController'
import { scanSession } from '../hooks/useScanSessionActive'
import { applied, passata } from '../lib/scannedList.testData'
import { controllerFake, flowFake, scannedFake, sessionEntries } from './scanScreen.testKit'

const controllerHook = vi.hoisted(() => ({ useScanController: vi.fn() }))
vi.mock('../hooks/useScanController', () => controllerHook)
vi.mock('../../shops/hooks/useShops', () => ({
  useShops: () => ({ shops: [{ id: 1, name: 'Aldi', location: { lat: 1, lon: 1 } }, { id: 2, name: 'Coop' }], isLoading: false, error: null, add: vi.fn() }),
}))
const lastShop = vi.hoisted(() => ({ getLastShopId: vi.fn((): number | null => 2), setLastShopId: vi.fn(), LAST_SHOP_KEY: 'x' }))
vi.mock('../lib/lastShop', () => lastShop)
const near = vi.hoisted(() => ({ useNearestShop: vi.fn() }))
vi.mock('../../shops/hooks/useNearestShop', () => near)

import { ScanScreen } from './ScanScreen'

const money = (c: number) => formatMinor(c, 'USD')
const VIEW_KEY = 'feeder.scan.view'

function open(c: ScanController = controllerFake({ scanned: scannedFake(sessionEntries()) }), entry = '/scan') {
  controllerHook.useScanController.mockReturnValue(c)
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ScanScreen />
    </MemoryRouter>,
  )
}
const scannedList = () => screen.getByRole('list', { name: 'Scanned list' })
const rowOf = (name: string) => within(scannedList()).getByRole('button', { name }).closest('li')!

beforeEach(() => {
  controllerHook.useScanController.mockReset()
  lastShop.getLastShopId.mockReturnValue(2)
  near.useNearestShop.mockReturnValue({ nearest: null, status: 'idle', position: null, failure: null, anyLocated: true, locate: vi.fn() })
  localStorage.clear()
})

describe('Split layout', () => {
  it('has the tall camera strip, then the Segmented and total, then the Scanned list', () => {
    open()
    const strip = screen.getByRole('region', { name: 'Scanner' })
    expect(strip).toHaveAttribute('data-size', 'tall')
    const tabs = screen.getByRole('radiogroup', { name: 'List view' })
    const follows = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(follows(strip, tabs)).toBe(true)
    expect(follows(tabs, scannedList())).toBe(true)
    expect(screen.queryByRole('list', { name: 'Shopping List' })).toBeNull()
  })

  it('the camera and the list are the two columns of one split (the desktop layout puts them side by side)', () => {
    const { container } = open()
    const split = container.querySelector('.scan-screen__split')!
    expect(split).not.toBeNull()
    expect(split.querySelector('.scan-screen__camera')).toContainElement(screen.getByRole('region', { name: 'Scanner' }))
    expect(split.querySelector('.scan-screen__list')).toContainElement(scannedList())
    expect(split.querySelector('.scan-screen__camera')!.compareDocumentPosition(split.querySelector('.scan-screen__list')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('the Segmented counts rows, not scans, and To get counts the open Lines', () => {
    open()
    expect(screen.getByRole('radio', { name: 'Scanned 3' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'To get 2' })).not.toBeChecked()
  })

  it('the total is the sum of the priced rows, and "+1 without a Price" counts the rest', () => {
    open()
    expect(screen.getByText(money(2 * 129 + 624))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+1 without a Price' })).toBeInTheDocument()
  })

  it('"+N without a Price" starts the Price entry on the first such row (no key: the flow picks it)', async () => {
    const c = controllerFake({ scanned: scannedFake(sessionEntries()) })
    open(c)
    await userEvent.click(screen.getByRole('button', { name: '+1 without a Price' }))
    expect(c.flow.startPriceEntry).toHaveBeenCalledTimes(1)
    expect(vi.mocked(c.flow.startPriceEntry).mock.calls[0]).toEqual([])
  })

  it('with every row priced the line is absent', () => {
    open(controllerFake({ scanned: scannedFake([applied('u-1', passata, { priceCents: 129 }, { priceCents: 129 })]) }))
    expect(screen.queryByText(/without a Price/)).toBeNull()
  })

  it('empty: "Nothing scanned yet", a zero total and no without-a-Price line', () => {
    open(controllerFake({ scanned: scannedFake([]) }))
    expect(screen.getByRole('heading', { name: 'Nothing scanned yet' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Scanned 0' })).toBeChecked()
    expect(screen.getByText(money(0))).toBeInTheDocument()
    expect(screen.queryByText(/without a Price/)).toBeNull()
  })

  it('To get shows the open Lines (the Shop screen LineRow), and remembers the choice on this device', async () => {
    const { unmount } = open()
    await userEvent.click(screen.getByRole('radio', { name: 'To get 2' }))
    expect(screen.queryByRole('list', { name: 'Scanned list' })).toBeNull()
    const toGet = screen.getByRole('list', { name: 'To get' })
    expect(within(toGet).getByRole('button', { name: /Passata/ })).toBeInTheDocument()
    expect(within(toGet).getByRole('button', { name: /Cheese/ })).toBeInTheDocument()
    expect(localStorage.getItem(VIEW_KEY)).toBe('to-get')
    unmount()
    open()
    expect(screen.getByRole('radio', { name: 'To get 2' })).toBeChecked()
  })

  it('a scan switches back to Scanned', () => {
    localStorage.setItem(VIEW_KEY, 'to-get')
    const view = open(controllerFake({ scanned: scannedFake(sessionEntries().slice(0, 2)) }))
    expect(screen.getByRole('radio', { name: 'To get 2' })).toBeChecked()
    controllerHook.useScanController.mockReturnValue(controllerFake({ scanned: scannedFake(sessionEntries()) }))
    view.rerender(
      <MemoryRouter initialEntries={['/scan']}>
        <ScanScreen />
      </MemoryRouter>,
    )
    expect(screen.getByRole('radio', { name: 'Scanned 3' })).toBeChecked()
  })

  it('passes the Scanned list no footer: "Read the receipt" belongs to a later work package', () => {
    open()
    expect(screen.queryByText('Read the receipt')).toBeNull()
  })

  it('the screen is no overlay: the bottom nav stays (no fixed full-screen layer, no dialog while nothing is open)', () => {
    open()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('Rows wired to the flow', () => {
  it('+, − and Remove of the active row call the flow with the row key', async () => {
    const c = controllerFake({ scanned: scannedFake(sessionEntries()) })
    open(c)
    await userEvent.click(within(scannedList()).getByRole('button', { name: 'Mutti passata 700 g' }))
    const mutti = rowOf('Mutti passata 700 g')
    await userEvent.click(within(mutti).getByRole('button', { name: 'Increase Quantity of Mutti passata 700 g' }))
    await userEvent.click(within(mutti).getByRole('button', { name: 'Decrease Quantity of Mutti passata 700 g' }))
    await userEvent.click(within(mutti).getByRole('button', { name: 'Remove Mutti passata 700 g' }))
    expect(c.flow.increment).toHaveBeenCalledWith('7')
    expect(c.flow.decrement).toHaveBeenCalledWith('7')
    expect(c.flow.removeRow).toHaveBeenCalledWith('7')
  })

  it('the active row\'s Price and "Add price" start the Price entry on that row', async () => {
    const c = controllerFake({ scanned: scannedFake(sessionEntries()) })
    open(c)
    await userEvent.click(within(scannedList()).getByRole('button', { name: 'Mutti passata 700 g' }))
    await userEvent.click(within(rowOf('Mutti passata 700 g')).getByRole('button', { name: /^Price of Mutti/ }))
    expect(c.flow.startPriceEntry).toHaveBeenLastCalledWith('7')
    await userEvent.click(within(rowOf('Regina toilet paper 9 pieces')).getByRole('button', { name: /^Add price/ }))
    expect(c.flow.startPriceEntry).toHaveBeenLastCalledWith('31')
  })
})

describe('Price entry', () => {
  const pricing = (key: string, over: Partial<ReturnType<typeof flowFake>> = {}) => flowFake({ pricing: { key }, paused: true, ...over })

  it('opens the sheet for the row being priced and outlines that row', () => {
    open(controllerFake({ scanned: scannedFake(sessionEntries()), flow: pricing('7') }))
    expect(screen.getByRole('dialog', { name: 'Price of Mutti passata 700 g' })).toBeInTheDocument()
    expect(rowOf('Mutti passata 700 g')).toHaveAttribute('data-pricing', 'true')
    expect(rowOf('Regina toilet paper 9 pieces')).not.toHaveAttribute('data-pricing')
  })

  it('shows "Last time here" from the Product at this Shop, and per pack · per kg for grams', () => {
    open(controllerFake({ scanned: scannedFake(sessionEntries()), flow: pricing('7') }))
    expect(screen.getByRole('button', { name: /Last time here \$1\.29/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'per kg' })).toBeInTheDocument()
  })

  it('a weighed row opens on per kg', () => {
    open(controllerFake({ scanned: scannedFake(sessionEntries()), flow: pricing('21') }))
    expect(screen.getByRole('radio', { name: 'per kg' })).toBeChecked()
  })

  it('"Next without a Price" is the primary while another row has none, and saves with intent next', async () => {
    const c = controllerFake({ scanned: scannedFake(sessionEntries()), flow: pricing('7') })
    open(c)
    for (const k of '1.45') await userEvent.click(screen.getByRole('button', { name: k === '.' ? 'Decimal separator' : k }))
    await userEvent.click(screen.getByRole('button', { name: /Next without a Price/ }))
    expect(c.flow.savePrice).toHaveBeenCalledWith('7', { basis: 'pack', cents: 145, packCents: 145, perKgCents: null }, 'next')
  })

  it('Save is the primary when the row is the last without a Price, and saves with intent save', async () => {
    const c = controllerFake({ scanned: scannedFake(sessionEntries()), flow: pricing('31') })
    open(c)
    expect(screen.queryByRole('button', { name: /Next without a Price/ })).toBeNull()
    for (const k of '0.02') await userEvent.click(screen.getByRole('button', { name: k === '.' ? 'Decimal separator' : k }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(c.flow.savePrice).toHaveBeenCalledWith('31', { basis: 'pack', cents: 2, packCents: 2, perKgCents: null }, 'save')
  })

  it('Close and Escape each save once with intent close (the flow discards an empty entry)', async () => {
    const c = controllerFake({ scanned: scannedFake(sessionEntries()), flow: pricing('31') })
    open(c)
    await userEvent.keyboard('{Escape}')
    expect(c.flow.savePrice).toHaveBeenCalledTimes(1)
    expect(c.flow.savePrice).toHaveBeenCalledWith('31', { basis: 'pack', cents: null, packCents: null, perKgCents: null }, 'close')
    await userEvent.click(within(document.querySelector<HTMLElement>('.price-keypad')!).getByRole('button', { name: 'Close' }))
    expect(c.flow.savePrice).toHaveBeenCalledTimes(2)
  })

  it('a refused or failed save keeps the sheet open and shows the error', async () => {
    const savePrice = vi.fn(async () => ({ status: 'refused' as const, error: 'Enter a number above 0' }))
    const c = controllerFake({ scanned: scannedFake(sessionEntries()), flow: pricing('31', { savePrice }) })
    open(c)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a number above 0')
    expect(screen.getByRole('dialog', { name: 'Price of Regina toilet paper 9 pieces' })).toBeInTheDocument()
  })

  it('is keyed by the row: Next remounts the keypad for the next row, empty', async () => {
    const c = controllerFake({ scanned: scannedFake(sessionEntries()), flow: pricing('7') })
    const view = open(c)
    await userEvent.click(screen.getByRole('button', { name: '9' }))
    controllerHook.useScanController.mockReturnValue({ ...c, flow: pricing('31') })
    view.rerender(
      <MemoryRouter initialEntries={['/scan']}>
        <ScanScreen />
      </MemoryRouter>,
    )
    const display = screen.getByRole('status', { name: 'Price of Regina toilet paper 9 pieces' })
    expect(display).not.toHaveTextContent('0.09')
  })
})

describe('Camera', () => {
  it('is on while nothing is open, paused while the Price entry or a sheet is open', () => {
    const idle = open()
    expect(screen.getByRole('region', { name: 'Scanner' })).toHaveAttribute('data-camera', 'on')
    idle.unmount()
    const pricing = open(controllerFake({ scanned: scannedFake(sessionEntries()), flow: flowFake({ pricing: { key: '7' }, paused: true }) }))
    expect(screen.getByRole('region', { name: 'Scanner' })).toHaveAttribute('data-camera', 'paused')
    expect(screen.getByText('Camera paused')).toBeInTheDocument()
    pricing.unmount()
    open(controllerFake({ flow: flowFake({ paused: true, sheet: { kind: 'unknown', mode: 'pack', target: { mode: 'pack', code: '05012345678900' } } }) }))
    expect(screen.getByRole('region', { name: 'Scanner' })).toHaveAttribute('data-camera', 'paused')
  })

  it('resumes after the sheet closes', () => {
    const c = controllerFake({ scanned: scannedFake(sessionEntries()), flow: flowFake({ pricing: { key: '7' }, paused: true }) })
    const view = open(c)
    controllerHook.useScanController.mockReturnValue({ ...c, flow: flowFake() })
    view.rerender(
      <MemoryRouter initialEntries={['/scan']}>
        <ScanScreen />
      </MemoryRouter>,
    )
    expect(screen.getByRole('region', { name: 'Scanner' })).toHaveAttribute('data-camera', 'on')
  })
})

describe('Remove of ×2 or more asks first', () => {
  const confirming = (over = {}) => flowFake({ paused: true, sheet: { kind: 'confirm_remove', key: '7', name: 'Mutti passata 700 g', count: 3 }, ...over })

  it('is the shared ConfirmDialog "Remove 3 Mutti passata 700 g?" with Keep them and Remove, never confirm()', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    const c = controllerFake({ scanned: scannedFake(sessionEntries()), flow: confirming() })
    open(c)
    const dialog = screen.getByRole('dialog', { name: 'Remove 3 Mutti passata 700 g?' })
    expect(within(dialog).getByText('Their Stock Lots and Price go too.')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep them' }))
    expect(c.flow.closeSheet).toHaveBeenCalledTimes(1)
    expect(c.flow.confirmRemove).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    expect(c.flow.confirmRemove).toHaveBeenCalledTimes(1)
    expect(confirm).not.toHaveBeenCalled()
    confirm.mockRestore()
  })
})

describe('Change Shop ends the session', () => {
  it('Change Shop calls endSession once, then shows the picker', async () => {
    const c = controllerFake({ scanned: scannedFake(sessionEntries()) })
    open(c)
    await userEvent.click(screen.getByRole('button', { name: 'Change Shop' }))
    expect(c.endSession).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { name: 'Where are you shopping?' })).toBeInTheDocument()
    expect(scanSession.isActive()).toBe(false)
  })

  it('endSession runs before the picker replaces the session', async () => {
    const seen: string[] = []
    const c = controllerFake({ endSession: vi.fn(() => void seen.push(screen.queryByRole('heading', { name: 'Where are you shopping?' }) ? 'picker' : 'session')) })
    open(c)
    await userEvent.click(screen.getByRole('button', { name: 'Change Shop' }))
    expect(seen).toEqual(['session'])
  })

  it('"Switch to <Shop>" ends the session too', async () => {
    near.useNearestShop.mockReturnValue({ nearest: { shop: { id: 1, name: 'Aldi' }, metres: 42 }, status: 'ready', position: null, failure: null, anyLocated: true, locate: vi.fn() })
    const c = controllerFake({ scanned: scannedFake(sessionEntries()) })
    open(c)
    await userEvent.click(screen.getByRole('button', { name: 'Switch to Aldi' }))
    expect(c.endSession).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Aldi' })).toBeInTheDocument()
  })
})

describe('Stock-take keeps today\'s behaviour', () => {
  async function stockTake(c = controllerFake({ list: undefined })) {
    lastShop.getLastShopId.mockReturnValue(null)
    open(c)
    await userEvent.click(screen.getByRole('button', { name: /Stock-take at home/ }))
  }

  it('has the camera, its heading and Back, but no Scanned list, Segmented, total or empty state', async () => {
    await stockTake()
    expect(screen.getByRole('heading', { level: 1, name: 'Stock-take at home' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Scanner' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'List view' })).toBeNull()
    expect(screen.queryByRole('list', { name: 'Scanned list' })).toBeNull()
    expect(screen.queryByText('Nothing scanned yet')).toBeNull()
    expect(scanSession.isActive()).toBe(false)
  })

  it('still opens the Stock-take sheet', async () => {
    const product = { id: 7, name: 'Mutti passata 700 g', ingredientId: 2, ingredientName: 'Passata', baseUnit: 'g' as const, packSize: 700, lastPriceCents: 159 }
    await stockTake(controllerFake({ list: undefined, flow: flowFake({ paused: true, sheet: { kind: 'stock_take', product } }) }))
    const dialog = screen.getByRole('dialog', { name: 'Stock-take: Mutti passata 700 g' })
    await userEvent.click(within(dialog).getByRole('button', { name: /set total/i }))
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Save' })).toBeInTheDocument())
  })
})
