// B9-43 (SSP-04, SSP-09, SSP-13, SSP-14): the Shop screen wires the notice, the complete tile and the open Line's sheet.
// Pinned wiring (the screen's own names are the developer's):
//   - the screen reads `useScanSessionActive` (scan/hooks) and `useReadAvailability` (import/hooks, `.enabled`) for "Read the receipt", and
//     `useUnsortedFromList(list)` for "Put away N Stock Lots";
//   - Put away goes to `/pantry?putAway=1` (a stub target until the Pantry's Put away sheet has a route: B9-29 owns the sheet); Read the receipt
//     to `/scan/receipt`;
//   - the open Line's sheet shows "Estimated at <picked Shop>"; "Change the Price" opens `ui/PriceSheet` over it (the Line sheet stays open)
//     and focus returns to that button when the Price sheet closes; "Get something else…" closes the Line sheet and opens Add to Shopping List
//     with the Ingredient select open, and Save adds the extra, marks the Line Not needed and shows ONE Undo toast.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeGarlic, makeList, makeOnion, makePast, makeTick } from '../testData'
import type { ShoppingList } from '../types'

const listHook = vi.hoisted(() => ({ useShoppingList: vi.fn() }))
vi.mock('../hooks/useShoppingList', () => listHook)
const actions = vi.hoisted(() => ({
  tick: vi.fn(), untick: vi.fn(), addExtra: vi.fn(), deleteExtra: vi.fn(), tickExtra: vi.fn(), untickExtra: vi.fn(), notNeeded: vi.fn(), neededAfterAll: vi.fn(), changeTick: vi.fn(), changeExtraTick: vi.fn(), untickAddition: vi.fn(),
}))
vi.mock('../hooks/useShoppingActions', () => ({ useShoppingActions: () => actions }))
const choice = vi.hoisted(() => ({ useShopChoice: vi.fn() }))
vi.mock('../hooks/useShopChoice', () => choice)
vi.mock('../hooks/useShopHere', () => ({ useShopHere: () => ({ status: 'idle', anyLocated: false, find: vi.fn() }) }))
vi.mock('../../shops/components/AddShopSheet', () => ({ AddShopSheet: () => null }))
const toast = vi.hoisted(() => ({ show: vi.fn() }))
vi.mock('../../../ui/Toast', () => ({ useToast: () => toast }))
const undoToast = vi.hoisted(() => ({ show: vi.fn() }))
vi.mock('../../../ui/useUndoToast', () => ({ useUndoToast: () => undoToast }))
vi.mock('../../../app/useMe', () => ({ useMe: () => ({ data: { householdTimeZone: 'UTC' } }) }))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../stock/hooks/useIngredientChoices', () => ({ useIngredientChoices: () => ({ choices: [{ id: 6, name: 'shallot', baseUnit: 'piece' }], isLoading: false }) }))
const scanSession = vi.hoisted(() => ({ active: true }))
vi.mock('../../scan/hooks/useScanSessionActive', () => ({ useScanSessionActive: () => scanSession.active }))
const assistant = vi.hoisted(() => ({ enabled: true }))
vi.mock('../../import/hooks/useReadAvailability', () => ({ useReadAvailability: () => ({ loading: false, enabled: assistant.enabled, isAdmin: false, statusFailed: false, settingsLink: false, photos: true, retry: vi.fn() }) }))
const unsorted = vi.hoisted(() => ({ n: 17 }))
vi.mock('../hooks/useUnsortedFromList', () => ({ useUnsortedFromList: () => unsorted.n }))
const products = vi.hoisted(() => ({ latestPrice: vi.fn(), recordPrice: vi.fn() }))
vi.mock('../../products/api', () => ({ productsApi: products }))
vi.mock('../lib/liveRefresh', () => ({ liveRefreshFor: () => ({ request: vi.fn().mockResolvedValue(undefined) }) }))

import { ShoppingScreen } from './ShoppingScreen'

function Where() {
  const l = useLocation()
  return <p data-testid="where">{l.pathname + l.search}</p>
}
function show(list: ShoppingList) {
  listHook.useShoppingList.mockReturnValue({ data: list, isLoading: false, error: null, stale: false, status: 'ready', state: 'ready', retry: vi.fn() })
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/shop']}>
        <Routes>
          <Route path="*" element={<><ShoppingScreen /><Where /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const where = () => screen.getByTestId('where').textContent
const complete = (over: Partial<ShoppingList> = {}) =>
  makeList({ lines: [makeGarlic({ ticked: true, quantity: 0, tick: makeTick() })], progress: { ticked: 1, total: 1 }, complete: true, summary: { lines: 1, spentCents: 229, lotsAdded: 1 }, ...over })
const openOnion = async () => {
  await userEvent.click(within(screen.getByRole('list', { name: 'To get' })).getByRole('button', { name: 'Onion' }))
  return screen.getByRole('dialog', { name: 'Onion' })
}
const onionList = () => makeList({ lines: [makeOnion()], progress: { ticked: 0, total: 1 }, unpricedLines: 0 })

beforeEach(() => {
  listHook.useShoppingList.mockReset()
  choice.useShopChoice.mockReturnValue({ shops: [{ id: 1, name: 'Coop' }], shopId: 1, setShopId: vi.fn(), isLoading: false })
  for (const f of Object.values(actions)) f.mockReset().mockResolvedValue(undefined)
  actions.addExtra.mockResolvedValue({ id: 31, text: null, ingredientId: 6 })
  undoToast.show.mockReset().mockReturnValue({ id: 1, dismiss: vi.fn() })
  toast.show.mockReset()
  scanSession.active = true
  assistant.enabled = true
  unsorted.n = 17
  products.latestPrice.mockReset().mockResolvedValue({ id: 3, productId: 21, shopId: 1, date: '2026-11-14', priceCents: 299, pricePerKgCents: null, pricePerKgDerived: false })
  products.recordPrice.mockReset().mockResolvedValue({ id: 4 })
})

describe('ShoppingScreen: the notice (SSP-04)', () => {
  it('says "Not marked Cooked yet" first, the slots under it, and Mark it goes to the Plan', async () => {
    const sat = (id: number, name: string) => makePast({ date: '2026-11-07', mealSlotId: id, mealSlotName: name })
    show(makeList({ lines: [makeOnion({ pastPlannedMeals: [sat(1, 'Breakfast'), sat(2, 'Lunch'), sat(3, 'Dinner')] })] }))
    const notice = screen.getByRole('region', { name: /^Not marked Cooked yet/ })
    expect(notice.querySelector('.shop-notice__slots')).toHaveTextContent('Sat Breakfast, Sat Lunch and Sat Dinner')
    expect(notice.querySelector('.shop-notice__count')).toHaveTextContent('3')
    await userEvent.click(within(notice).getByRole('button', { name: 'Mark it' }))
    expect(where()).toMatch(/^\/plan\?mark=2026-11-07:1/)
  })
})

describe('ShoppingScreen: Shopping List complete (SSP-09)', () => {
  const tile = () => document.querySelector<HTMLElement>('.celebration-tile')!

  it('a success status tile with its rows, "Put away 17 Stock Lots" the one primary, and "Read the receipt" secondary after a Scan session', () => {
    show(complete())
    expect(tile()).toHaveAttribute('data-status', 'success')
    expect(within(tile()).getByRole('list', { name: 'This shop' })).toHaveTextContent('Spent at Coop')
    expect(within(tile()).getByRole('button', { name: 'Put away 17 Stock Lots' })).toHaveAttribute('data-variant', 'primary')
    expect(within(tile()).getByRole('button', { name: 'Read the receipt' })).toHaveAttribute('data-variant', 'secondary')
  })

  it('the metric strip\'s Scan is secondary with "Every Line is ticked", so the tile owns the page\'s one primary', () => {
    show(complete())
    expect(screen.getByRole('button', { name: 'Scan' })).toHaveAttribute('data-variant', 'secondary')
    expect(screen.getByText('Every Line is ticked')).toBeInTheDocument()
    expect(document.querySelectorAll('main button[data-variant="primary"], .shop-screen button[data-variant="primary"]')).toHaveLength(1)
  })

  it('Put away goes to the Pantry\'s Put away, Read the receipt to /scan/receipt', async () => {
    show(complete())
    await userEvent.click(within(tile()).getByRole('button', { name: 'Put away 17 Stock Lots' }))
    expect(where()).toBe('/pantry?putAway=1')
  })

  it('Read the receipt opens /scan/receipt', async () => {
    show(complete())
    await userEvent.click(within(tile()).getByRole('button', { name: 'Read the receipt' }))
    expect(where()).toBe('/scan/receipt')
  })

  it('no Scan session today: no Read the receipt (and with nothing to put away: no button at all)', () => {
    scanSession.active = false
    unsorted.n = 0
    show(complete())
    expect(within(tile()).queryAllByRole('button')).toHaveLength(0)
  })

  it('the Recipe Assistant off: no Read the receipt', () => {
    assistant.enabled = false
    show(complete())
    expect(within(tile()).queryByRole('button', { name: 'Read the receipt' })).toBeNull()
  })

  it('Nothing to put away after a Scan session: Read the receipt becomes the primary', () => {
    unsorted.n = 0
    show(complete())
    expect(within(tile()).getByRole('button', { name: 'Read the receipt' })).toHaveAttribute('data-variant', 'primary')
  })
})

describe('ShoppingScreen: the open Line\'s sheet (SSP-13, SSP-14)', () => {
  it('opens with To get, Estimated at Coop (the picked Shop), For and the footer', async () => {
    show(onionList())
    const sheet = await openOnion()
    expect(within(sheet).getByRole('list', { name: 'Line' })).toHaveTextContent('Estimated at Coop')
    expect(within(sheet).getByRole('list', { name: 'Line' })).toHaveTextContent('$2.99 a pack, 14 Nov · not bought here yet')
    expect(within(sheet).getByRole('list', { name: 'For' })).toHaveTextContent('Mon Lunch')
    expect(within(sheet).getByRole('button', { name: 'Get something else…' })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Not needed' })).toBeInTheDocument()
    expect(within(sheet).getByText('Not needed leaves these 3 Planned Meals short of Onion.')).toBeInTheDocument()
  })

  it('with Any Shop it says "Estimated" without a Shop', async () => {
    choice.useShopChoice.mockReturnValue({ shops: [{ id: 1, name: 'Coop' }], shopId: null, setShopId: vi.fn(), isLoading: false })
    show(onionList())
    const sheet = await openOnion()
    expect(sheet).not.toHaveTextContent('Estimated at')
  })

  it('Change the Price opens the Price sheet over the Line sheet (which stays open); Save records the Price at Coop today', async () => {
    show(onionList())
    const sheet = await openOnion()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Change the Price' }))
    const price = await screen.findByRole('dialog', { name: 'Price of Onion pack' })
    expect(screen.getByRole('dialog', { name: 'Onion', hidden: true })).toBeInTheDocument()
    expect(await within(price).findByRole('button', { name: /Last time here \$2\.99/ })).toBeInTheDocument()
    for (const k of '3.49') await userEvent.click(within(price).getByRole('button', { name: k === '.' ? 'Decimal separator' : k }))
    await userEvent.click(within(price).getByRole('button', { name: 'Save' }))
    // the Price's date is the Household's today, the list's `today` (makeList: 2026-11-09); 2026-11-15 is the range's end (`to`)
    await waitFor(() => expect(products.recordPrice).toHaveBeenCalledExactlyOnceWith(21, { shopId: 1, date: '2026-11-09', priceCents: 349 }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Price of Onion pack' })).toBeNull())
  })

  it('closing the Price sheet returns the focus to "Change the Price"', async () => {
    show(onionList())
    const sheet = await openOnion()
    const button = within(sheet).getByRole('button', { name: 'Change the Price' })
    await userEvent.click(button)
    const price = await screen.findByRole('dialog', { name: 'Price of Onion pack' })
    await userEvent.click(within(price).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Price of Onion pack' })).toBeNull())
    await waitFor(() => expect(within(screen.getByRole('dialog', { name: 'Onion' })).getByRole('button', { name: 'Change the Price' })).toHaveFocus())
  })

  it('"Get something else…" closes the Line sheet and opens Add to Shopping List with the Ingredient select open', async () => {
    show(onionList())
    const sheet = await openOnion()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Get something else…' }))
    const add = await screen.findByRole('dialog', { name: 'Add to Shopping List' })
    expect(screen.queryByRole('dialog', { name: 'Onion' })).toBeNull()
    expect(within(add).getByRole('combobox', { name: /Ingredient/ })).toHaveAttribute('aria-expanded', 'true')
  })

  it('Save there adds the extra, marks Onion Not needed for the range and Shop, and shows one toast "Onion is Not needed; Shallot added" with Undo', async () => {
    show(onionList())
    const sheet = await openOnion()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Get something else…' }))
    const add = await screen.findByRole('dialog', { name: 'Add to Shopping List' })
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: /shallot/i }))
    await userEvent.type(within(add).getByRole('spinbutton', { name: 'Quantity' }), '12')
    await userEvent.click(within(add).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(actions.notNeeded).toHaveBeenCalledExactlyOnceWith({ ingredientId: 5, to: '2026-11-15', shopId: 1 }))
    expect(actions.addExtra).toHaveBeenCalledExactlyOnceWith({ ingredientId: 6, quantity: 12 })
    expect(undoToast.show).toHaveBeenCalledTimes(1)
    expect(undoToast.show.mock.calls[0]![0]).toMatchObject({ headline: 'Onion is Not needed; Shallot added' })
    expect(screen.queryByRole('dialog', { name: 'Add to Shopping List' })).toBeNull()
  })

  it('plain Not needed still works from the same sheet (its own toast, as before)', async () => {
    show(onionList())
    const sheet = await openOnion()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Not needed' }))
    expect(actions.notNeeded).toHaveBeenCalledExactlyOnceWith({ ingredientId: 5, to: '2026-11-15', shopId: 1 })
    expect(actions.addExtra).not.toHaveBeenCalled()
  })
})
