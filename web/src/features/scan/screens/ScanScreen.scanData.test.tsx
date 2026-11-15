// B9-41 (SSP-07, SSP-11, SSP-15; P41): what the Scan screen hands the new-Product sheet for a weighed code and for a weight-style code
// with no rule, the Price entry of a new weighed Product, To get with manual extras, and the visible titles of the lists. The
// controller is a fake (scanScreen.testKit.tsx); the sheet is a fake that shows what the screen hands it.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeExtra, makeLine, makeList } from '../../shop/testData'
import type { NewProductSheetProps } from '../components/NewProductSheet'
import type { ScanController } from '../hooks/useScanController'
import type { Op } from '../types'
import { controllerFake, flowFake, scannedFake, sessionEntries } from './scanScreen.testKit'

const controllerHook = vi.hoisted(() => ({ useScanController: vi.fn() }))
vi.mock('../hooks/useScanController', () => controllerHook)
const me = vi.hoisted(() => ({ isAdmin: false }))
vi.mock('../../../app/useMe', () => ({ useMe: () => ({ data: { isAdmin: me.isAdmin, householdTimeZone: 'UTC' } }) }))
vi.mock('../../shops/hooks/useShops', () => ({ useShops: () => ({ shops: [{ id: 2, name: 'Coop' }], isLoading: false, error: null, add: vi.fn() }) }))
vi.mock('../lib/lastShop', () => ({ getLastShopId: () => 2, setLastShopId: vi.fn(), LAST_SHOP_KEY: 'x' }))
vi.mock('../../shops/hooks/useNearestShop', () => ({ useNearestShop: () => ({ nearest: null, status: 'idle', position: null, failure: null, anyLocated: true, locate: vi.fn() }) }))
vi.mock('../../import/hooks/useReadAvailability', () => ({
  useReadAvailability: () => ({ loading: false, enabled: true, isAdmin: false, photos: true, settingsLink: false, statusFailed: false, retry: () => {} }),
}))
const sheet = vi.hoisted(() => ({ props: null as NewProductSheetProps | null }))
vi.mock('../components/NewProductSheet', () => ({
  NewProductSheet: (p: NewProductSheetProps) => {
    sheet.props = p
    return <div role="dialog" aria-label="What is this?" />
  },
}))

import { ScanScreen } from './ScanScreen'

function Where() {
  const { pathname, hash } = useLocation()
  return <p data-testid="where">{pathname + hash}</p>
}
function open(c: ScanController) {
  controllerHook.useScanController.mockReturnValue(c)
  return render(
    <MemoryRouter initialEntries={['/scan']}>
      <ScanScreen />
      <Where />
    </MemoryRouter>,
  )
}
const unknown = (mode: 'pack' | 'weighed' | 'weighed_price', target: object, extra: object = {}) =>
  flowFake({ paused: true, sheet: { kind: 'unknown', mode, target, ...extra } as never })

beforeEach(() => {
  controllerHook.useScanController.mockReset()
  localStorage.clear()
  me.isAdmin = false
  sheet.props = null
})

describe('ScanScreen: a weighed code (SSP-07)', () => {
  it('hands the sheet the decoded weight and the item code, and no barcode line', () => {
    open(controllerFake({ flow: unknown('weighed', { mode: 'weighed', ruleId: 3, itemCode: '012300', weightGrams: 312 }) }))
    expect(sheet.props!.weighed).toEqual({ grams: 312, itemCode: '012300' })
    expect(sheet.props!.barcode).toBeUndefined()
  })

  it('a pack code has no weighed prop, and neither has a price-valued code (the sheet asks its weight)', () => {
    const { unmount } = open(controllerFake({ flow: unknown('pack', { mode: 'pack', code: '08000500310427' }) }))
    expect(sheet.props!.weighed).toBeUndefined()
    expect(sheet.props!.barcode).toBe('08000500310427')
    unmount()
    open(controllerFake({ flow: unknown('weighed_price', { mode: 'weighed_price', ruleId: 4, itemCode: '000007', priceCents: 465 }) }))
    expect(sheet.props!.weighed).toBeUndefined()
  })

  // The new Product is not on the phone until the next sync of the catalogue: its row still opens the keypad on per kg.
  const op: Op = {
    clientUuid: 'u-9',
    scannedAt: '2026-11-14T10:00:00Z',
    kind: 'shop_unknown',
    shopId: 2,
    ruleId: 3,
    itemCode: '012300',
    quantity: 312,
    weighed: true,
    ingredient: { id: 5, name: 'Cheese', baseUnit: 'g', kind: 'food' },
    productName: 'Loose cheese',
  }

  it('the Price entry of the new weighed row opens on per kg with no Price at the Shop yet, and its header has no Close', () => {
    open(controllerFake({ scanned: scannedFake([{ op, result: null }], []), product: () => undefined, flow: flowFake({ paused: true, pricing: { key: 'new:u-9' } }) }))
    const keypad = screen.getByRole('dialog', { name: 'Price of Loose cheese' })
    expect(within(keypad).getByRole('radio', { name: 'per kg' })).toBeChecked()
    expect(within(keypad).getByText('No Price at Coop yet')).toBeInTheDocument()
    expect(keypad.querySelector('.sheet__header button')).toBeNull()
  })
})

describe('ScanScreen: a weight-style code at a Shop with no rule (SSP-15)', () => {
  const hinted = () => unknown('pack', { mode: 'pack', code: '02100123012503' }, { weightCodeHint: true })

  it('the flow\'s flag makes the hint: an Admin can set the rule up, and that opens the Shop\'s page', async () => {
    me.isAdmin = true
    open(controllerFake({ flow: hinted() }))
    expect(sheet.props!.weightCodeHint).toMatchObject({ admin: true })
    sheet.props!.weightCodeHint!.onSetUp()
    // batch w5a: at its Weight Barcode Rules (the Shop page's section anchor)
    expect(await screen.findByTestId('where')).toHaveTextContent(/^\/settings\/shops\/2#weight-barcode-rules$/)
  })

  it('a User gets the hint without the way in', () => {
    open(controllerFake({ flow: hinted() }))
    expect(sheet.props!.weightCodeHint).toMatchObject({ admin: false })
  })

  it('no flag, no hint', () => {
    open(controllerFake({ flow: unknown('pack', { mode: 'pack', code: '08000500310427' }) }))
    expect(sheet.props!.weightCodeHint).toBeUndefined()
  })
})

describe('ScanScreen: To get with manual extras (SSP-11)', () => {
  const list = makeList({
    lines: [makeLine(), makeLine({ ingredientId: 5, name: 'Cheese', quantity: 200, pack: null })],
    extras: [makeExtra({ id: 1, text: 'napkins' }), makeExtra({ id: 2, text: 'candles', ticked: true })],
  })
  const toGetView = () => {
    localStorage.setItem('feeder.scan.view', 'to-get')
    return screen.getByRole('list', { name: 'To get' })
  }

  it('the open extras follow the Lines; a ticked extra is not there', () => {
    localStorage.setItem('feeder.scan.view', 'to-get')
    open(controllerFake({ list, scanned: scannedFake(sessionEntries()) }))
    const names = within(toGetView()).getAllByRole('button').map((b) => b.getAttribute('aria-label'))
    expect(names).toEqual(['Tick Passata', 'Tick Cheese', 'Tick napkins'])
  })

  it('a tap ticks the extra through the controller\'s tick, and stays on /scan', async () => {
    localStorage.setItem('feeder.scan.view', 'to-get')
    const c = controllerFake({ list, scanned: scannedFake(sessionEntries()) })
    open(c)
    await userEvent.click(within(toGetView()).getByRole('button', { name: 'Tick napkins' }))
    expect(c.toGetTick.tick).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ key: 'extra:1', kind: 'extra', extraId: 1 }))
    expect(screen.getByTestId('where')).toHaveTextContent('/scan')
  })

  it('with every Line ticked and an open extra the tab is not empty', () => {
    localStorage.setItem('feeder.scan.view', 'to-get')
    open(controllerFake({ list: makeList({ lines: [], extras: [makeExtra({ id: 1, text: 'napkins' })] }), scanned: { ...scannedFake(sessionEntries()), toGet: [], toGetCount: 1 } }))
    expect(screen.queryByText('Nothing left to get')).toBeNull()
    expect(screen.getByRole('button', { name: 'Tick napkins' })).toBeInTheDocument()
  })
})

describe('ScanScreen: the lists have visible titles (P41)', () => {
  it('the Scanned list and the Receipt group are each named by a visible heading, and the lists keep their names', () => {
    open(controllerFake({ scanned: scannedFake(sessionEntries()) }))
    expect(screen.getByRole('heading', { level: 2, name: 'Scanned list' })).toBeVisible()
    expect(screen.getByRole('heading', { level: 2, name: 'Receipt' })).toBeVisible()
    expect(screen.getByRole('list', { name: 'Scanned list' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Receipt' })).toBeInTheDocument()
  })
})
