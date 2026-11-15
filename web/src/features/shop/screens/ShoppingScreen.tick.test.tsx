// B9-34 (SSP-01, SSP-02, SSP-18, A11Y-07, RES-06): the Shop screen wires the tick flow. One tap ticks (no sheet); the toast offers
// Change; a "more since your tick" row is an ordinary open row; a ticked row opens a sheet with Take back, Change amount and Untick;
// a failed tick is the failure toast. The domain is in lib/tickAmount and hooks/useTickFlow (their own tests).
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { makeAddition, makeGarlic, makeLine, makeList, makeTick } from '../testData'
import type { ShoppingList } from '../types'

const listHook = vi.hoisted(() => ({ useShoppingList: vi.fn() }))
vi.mock('../hooks/useShoppingList', () => listHook)
const actions = vi.hoisted(() => ({
  tick: vi.fn(), untick: vi.fn(), addExtra: vi.fn(), deleteExtra: vi.fn(), tickExtra: vi.fn(), untickExtra: vi.fn(), notNeeded: vi.fn(), neededAfterAll: vi.fn(), changeTick: vi.fn(), changeExtraTick: vi.fn(),
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
vi.mock('../../stock/hooks/useIngredientChoices', () => ({ useIngredientChoices: () => ({ choices: [], isLoading: false }) }))

import { ShoppingScreen } from './ShoppingScreen'

function show(list: ShoppingList) {
  listHook.useShoppingList.mockReturnValue({ data: list, isLoading: false, error: null, stale: false, status: 'ready', state: 'ready', retry: vi.fn() })
  return render(
    <MemoryRouter initialEntries={['/shop']}>
      <Routes>
        <Route path="/shop" element={<ShoppingScreen />} />
      </Routes>
    </MemoryRouter>,
  )
}
const mine = makeAddition({ quantity: 500, clientUuid: 'u-1' })
const tickedGarlic = (over = {}) => makeGarlic({ ticked: true, quantity: 0, tick: makeTick({ additions: [mine] }), ...over })
const toastInput = () => undoToast.show.mock.calls.at(-1)![0] as { headline: string; subline?: string; actions?: { label: string; onClick: () => void }[] }

beforeEach(() => {
  listHook.useShoppingList.mockReset()
  choice.useShopChoice.mockReturnValue({ shops: [{ id: 1, name: 'Coop' }], shopId: 1, setShopId: vi.fn(), isLoading: false })
  for (const f of Object.values(actions)) f.mockReset().mockResolvedValue({ ticked: true, lotId: 5, created: true, added: 500, quantity: 0 })
  undoToast.show.mockReset().mockReturnValue({ id: 1, dismiss: vi.fn() })
  toast.show.mockReset()
})

describe('ShoppingScreen: one tap (SSP-01, SSP 2)', () => {
  it('ticks Garlic with its 500 g pack at once, and the toast says "Garlic ticked" and "500 g added to Stock" with Change', async () => {
    show(makeList({ lines: [makeGarlic()] }))
    await userEvent.click(screen.getByRole('button', { name: 'Tick Garlic' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(actions.tick).toHaveBeenCalledExactlyOnceWith({ ingredientId: 9, to: '2026-11-15', quantity: 500, shopId: 1, clientUuid: expect.any(String) })
    expect(toastInput()).toMatchObject({ headline: 'Garlic ticked', subline: '500 g added to Stock' })
    expect(toastInput().actions?.map((a) => a.label)).toEqual(['Change'])
  })

  it('the toast\'s Change opens "Garlic: how much?" with what the tick added, and Save changes that addition only', async () => {
    show(makeList({ lines: [makeGarlic()] }))
    await userEvent.click(screen.getByRole('button', { name: 'Tick Garlic' }))
    const sent = actions.tick.mock.calls[0]![0]
    act(() => toastInput().actions![0]!.onClick())
    const sheet = await screen.findByRole('dialog', { name: 'Garlic: how much?' })
    expect(within(sheet).getByText('+500 g')).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('radio', { name: /What the Line needed/ }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
    expect(actions.changeTick).toHaveBeenCalledExactlyOnceWith({ ingredientId: 9, to: '2026-11-15', quantity: 150, shopId: 1, clientUuid: sent.clientUuid })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('a failed tick is the failure toast ("Couldn’t tick Garlic", with Try again), not an Undo toast', async () => {
    actions.tick.mockRejectedValue(new ApiError(500, 'internal', 'boom'))
    show(makeList({ lines: [makeGarlic()] }))
    await userEvent.click(screen.getByRole('button', { name: 'Tick Garlic' }))
    expect(undoToast.show).not.toHaveBeenCalled()
    expect(toast.show).toHaveBeenCalledWith(expect.objectContaining({ status: 'error', title: 'Couldn’t tick Garlic' }))
  })
})

describe('ShoppingScreen: more since your tick (SSP-02)', () => {
  const grown = () => makeList({ lines: [makeGarlic({ ticked: true, need: 650, quantity: 500, more: 500, pack: null, tick: makeTick({ additions: [mine] }) })], progress: { ticked: 0, total: 2 } })

  it('Garlic is in Ticked ("+500 g in Stock") and again in To get with "More since your tick"', () => {
    show(grown())
    const open = within(screen.getByRole('list', { name: 'To get' }))
    expect(open.getByRole('button', { name: 'Garlic' })).toHaveAccessibleDescription(/500 g.*more since your tick/i)
    const ticked = within(screen.getByRole('list', { name: 'Ticked' }))
    expect(ticked.getByRole('button', { name: 'Tick Garlic', pressed: true })).toBeInTheDocument()
    expect(ticked.getByText('+500 g in Stock')).toBeInTheDocument()
  })

  it('ticking the open row ticks the difference', async () => {
    show(grown())
    await userEvent.click(within(screen.getByRole('list', { name: 'To get' })).getByRole('button', { name: 'Tick Garlic' }))
    expect(actions.tick).toHaveBeenCalledWith(expect.objectContaining({ ingredientId: 9, quantity: 500 }))
  })
})

describe('ShoppingScreen: the ticked Line\'s sheet (SSP-18)', () => {
  const tickedList = () => makeList({ lines: [tickedGarlic()], progress: { ticked: 1, total: 1 } })
  const openSheet = async () => {
    await userEvent.click(within(screen.getByRole('list', { name: 'Ticked' })).getByRole('button', { name: 'Garlic' }))
    return screen.getByRole('dialog', { name: 'Garlic' })
  }

  it('opens with the state line, the additions and the footer (it is no dead end)', async () => {
    show(tickedList())
    const sheet = await openSheet()
    expect(within(sheet).getByText('Ticked · 500 g added to Stock')).toBeInTheDocument()
    expect(within(sheet).getByText('Ticked at 10:12 · Not sorted')).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Untick Garlic' })).toBeInTheDocument()
  })

  it('Untick unticks the Line and closes the sheet', async () => {
    show(tickedList())
    const sheet = await openSheet()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Untick Garlic' }))
    expect(actions.untick).toHaveBeenCalledExactlyOnceWith(9, '2026-11-15')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Take back takes that addition back (to 0, by its client id) and says so with an Undo toast', async () => {
    show(tickedList())
    const sheet = await openSheet()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Take back your 500 g' }))
    expect(actions.changeTick).toHaveBeenCalledExactlyOnceWith({ ingredientId: 9, to: '2026-11-15', quantity: 0, shopId: 1, clientUuid: 'u-1' })
    expect(toastInput().headline).toBe('Your 500 g of Garlic was taken back from Stock')
  })

  it('Change amount opens the Change sheet for the viewer\'s addition', async () => {
    show(tickedList())
    const sheet = await openSheet()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Change amount' }))
    const change = await screen.findByRole('dialog', { name: 'Garlic: how much?' })
    expect(within(change).getByText('Ticked at 10:12 · Not sorted')).toBeInTheDocument()
    await userEvent.click(within(change).getByRole('button', { name: 'Tick without adding' }))
    expect(actions.changeTick).toHaveBeenCalledExactlyOnceWith({ ingredientId: 9, to: '2026-11-15', quantity: 0, shopId: 1, clientUuid: 'u-1' })
  })

  it('the row\'s own tick still unticks at once (as before), without opening the sheet', async () => {
    show(tickedList())
    await userEvent.click(within(screen.getByRole('list', { name: 'Ticked' })).getByRole('button', { name: 'Tick Garlic', pressed: true }))
    expect(actions.untick).toHaveBeenCalledExactlyOnceWith(9, '2026-11-15')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('ShoppingScreen: the loading state (B9-20 left the old two-tile skeleton)', () => {
  it('loads as a list of rows, like the screen it becomes: no tile skeleton', () => {
    listHook.useShoppingList.mockReturnValue({ data: undefined, isLoading: true, error: null, stale: false, status: 'loading', state: 'loading', retry: vi.fn() })
    const { container } = render(
      <MemoryRouter initialEntries={['/shop']}>
        <Routes>
          <Route path="/shop" element={<ShoppingScreen />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(container.querySelector('.skeleton-list')).not.toBeNull()
    expect(container.querySelector('.skeleton[data-variant="tile"], .skeleton-block[data-variant="tile"]')).toBeNull()
  })
})

describe('ShoppingScreen: other sizes of the same data', () => {
  it('ticked Lines of other Ingredients are untouched by a tick of this one', async () => {
    show(makeList({ lines: [makeLine({ ingredientId: 1, name: 'Dill', quantity: 5, pack: null }), makeGarlic()], progress: { ticked: 0, total: 2 } }))
    await userEvent.click(screen.getByRole('button', { name: 'Tick Dill' }))
    expect(actions.tick).toHaveBeenCalledExactlyOnceWith({ ingredientId: 1, to: '2026-11-15', quantity: 5, shopId: 1, clientUuid: expect.any(String) })
  })
})
