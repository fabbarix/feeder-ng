// B9-54 (RES-03, mocks/res-03-shop-offline.html; decisions RES 1 and RES 2): the Shop opened offline. A tick queues; the row is ticked at once with the
// waiting state, no error tile and no failure toast; the metrics say "· 1 waiting"; Undo takes it back out of the queue. When the queue syncs
// the notices come above the metrics: "Garlic was ticked twice" (info, Take mine back / Dismiss) and "Couldn’t sync the Tick of Garlic." (danger, Add
// to Stock / Dismiss), the refused row shows "Tick not synced". The screen mounts nothing of the queue itself: it uses `useSharedSyncQueue()`
// (scan/components/SyncQueueProvider), here with an injected queue; the data hooks are mocked as in ShoppingScreen.tick.test.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { SyncQueueProvider } from '../../scan/components/SyncQueueProvider'
import { createMemoryOpStore, OfflineQueue } from '../../scan/lib/queue'
import type { Op, ScanResult } from '../../scan/types'
import { makeGarlic, makeLine, makeList } from '../testData'
import type { ShoppingList } from '../types'

const listHook = vi.hoisted(() => ({ useShoppingList: vi.fn() }))
vi.mock('../hooks/useShoppingList', () => listHook)
const actions = vi.hoisted(() => ({
  tick: vi.fn(), untick: vi.fn(), addExtra: vi.fn(), deleteExtra: vi.fn(), tickExtra: vi.fn(), untickExtra: vi.fn(), notNeeded: vi.fn(), neededAfterAll: vi.fn(), changeTick: vi.fn(), changeExtraTick: vi.fn(), untickAddition: vi.fn(),
}))
vi.mock('../hooks/useShoppingActions', () => ({ useShoppingActions: () => actions }))
const stockActions = vi.hoisted(() => ({ addLot: vi.fn() }))
vi.mock('../../stock/hooks/useStock', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../stock/hooks/useStock')>()), useStockActions: () => stockActions }))
const choice = vi.hoisted(() => ({ useShopChoice: vi.fn() }))
vi.mock('../hooks/useShopChoice', () => choice)
vi.mock('../hooks/useShopHere', () => ({ useShopHere: () => ({ status: 'idle', anyLocated: false, find: vi.fn() }) }))
vi.mock('../../shops/components/AddShopSheet', () => ({ AddShopSheet: () => null }))
const toast = vi.hoisted(() => ({ show: vi.fn() }))
vi.mock('../../../ui/Toast', () => ({ useToast: () => toast }))
const undoToast = vi.hoisted(() => ({ show: vi.fn() }))
vi.mock('../../../ui/useUndoToast', () => ({ useUndoToast: () => undoToast }))
vi.mock('../../../app/useMe', () => ({ useMe: () => ({ data: { displayName: 'Ana', householdTimeZone: 'UTC' } }) }))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../stock/hooks/useIngredientChoices', () => ({ useIngredientChoices: () => ({ choices: [], isLoading: false }) }))

import { ShoppingScreen } from './ShoppingScreen'

const down = () => new ApiError(0, 'network', 'The network is unreachable')
const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
const list = () => makeList({ lines: [makeGarlic(), makeLine({ ingredientId: 1, name: 'Dill', quantity: 5, pack: null })], progress: { ticked: 0, total: 2 } })

function show(data: ShoppingList = list(), { online = false, sync = async (): Promise<ScanResult[]> => { throw down() } }: { online?: boolean; sync?: (ops: Op[]) => Promise<ScanResult[]> } = {}) {
  listHook.useShoppingList.mockReturnValue({ data, isLoading: false, error: null, stale: false, status: 'ready', state: 'ready', retry: vi.fn() })
  const queue = new OfflineQueue(createMemoryOpStore())
  const api = { sync: vi.fn(sync) }
  const view = render(
    <QueryClientProvider client={qc()}>
      <SyncQueueProvider queue={queue} api={api} isOnline={() => online}>
        <MemoryRouter initialEntries={['/shop']}>
          <Routes>
            <Route path="/shop" element={<ShoppingScreen />} />
          </Routes>
        </MemoryRouter>
      </SyncQueueProvider>
    </QueryClientProvider>,
  )
  return { ...view, queue, api }
}
const toastInput = () => undoToast.show.mock.calls.at(-1)![0] as { headline: string; status?: string; undo: () => Promise<unknown> }
const row = (container: HTMLElement, name: string) => container.querySelector(`[data-focus-key="${name}"]`) as HTMLElement

beforeEach(() => {
  listHook.useShoppingList.mockReset()
  choice.useShopChoice.mockReturnValue({ shops: [{ id: 1, name: 'Coop' }], shopId: 1, setShopId: vi.fn(), isLoading: false })
  for (const f of Object.values(actions)) f.mockReset().mockResolvedValue({ ticked: true, lotId: 5, created: true, added: 500, quantity: 0 })
  stockActions.addLot.mockReset().mockResolvedValue(undefined)
  undoToast.show.mockReset().mockReturnValue({ id: 1, dismiss: vi.fn() })
  toast.show.mockReset()
})

describe('ShoppingScreen offline: tick the first row', () => {
  it('the row is ticked at once, waiting to sync: no error tile, no failure toast, nothing sent', async () => {
    const { container } = show()
    await userEvent.click(screen.getByRole('button', { name: 'Tick Garlic' }))
    const ticked = within(await screen.findByRole('list', { name: 'Ticked' }))
    expect(ticked.getByRole('button', { name: 'Tick Garlic, waiting to sync', pressed: true })).toBeInTheDocument()
    expect(container.querySelector('[data-sync="pending"]')).not.toBeNull()
    expect(container.querySelector('.error-state')).toBeNull()
    expect(actions.tick).not.toHaveBeenCalled()
    expect(toast.show).not.toHaveBeenCalled()
    expect(undoToast.show).toHaveBeenCalledTimes(1)
    expect(toastInput()).toMatchObject({ headline: 'Garlic ticked', status: 'pending' })
  })

  it('its meta says "Waiting to sync · 500 g to Stock" and the Dill row is untouched', async () => {
    const { container } = show()
    await userEvent.click(screen.getByRole('button', { name: 'Tick Garlic' }))
    await screen.findByRole('button', { name: 'Tick Garlic, waiting to sync' })
    expect(row(container, 'line:9').querySelector('.list-row__meta-text')).toHaveTextContent('Waiting to sync · 500 g to Stock')
    expect(row(container, 'line:1')).not.toHaveAttribute('data-sync')
  })

  it('the metrics count it: "1 ticked · 1 waiting · until Sun 15"', async () => {
    const { container } = show()
    await userEvent.click(screen.getByRole('button', { name: 'Tick Garlic' }))
    await screen.findByRole('button', { name: 'Tick Garlic, waiting to sync' })
    expect(container.querySelector('.shop-metrics__meta')).toHaveTextContent('1 ticked · 1 waiting · until Sun 15')
    expect(container.querySelector('[data-metric="left"]')).toHaveTextContent('1')
  })

  it('Undo takes it out of the queue: the row is back in To get and nothing was ever sent', async () => {
    const { queue, api } = show()
    await userEvent.click(screen.getByRole('button', { name: 'Tick Garlic' }))
    await screen.findByRole('button', { name: 'Tick Garlic, waiting to sync' })
    await act(async () => void (await toastInput().undo()))
    expect(await screen.findByRole('button', { name: 'Tick Garlic', pressed: false })).toBeInTheDocument()
    expect(await queue.pending()).toEqual([])
    expect(api.sync).not.toHaveBeenCalled()
  })

  it('pressing the waiting row\'s own tick takes it back out of the queue too', async () => {
    const { queue } = show()
    await userEvent.click(screen.getByRole('button', { name: 'Tick Garlic' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Tick Garlic, waiting to sync' }))
    expect(await screen.findByRole('button', { name: 'Tick Garlic', pressed: false })).toBeInTheDocument()
    expect(await queue.pending()).toEqual([])
    expect(actions.untick).not.toHaveBeenCalled()
  })
})

describe('ShoppingScreen: a sync that ticked the Line twice (RES 2)', () => {
  const twice = async (ops: Op[]): Promise<ScanResult[]> =>
    ops.map((o) => ({
      clientUuid: o.clientUuid,
      status: 'applied',
      tick: { lotId: 7, added: 500, alsoTickedBy: [{ name: 'Sam', quantity: 500, by: 'hand', mine: false, tickedAt: '2026-11-14T10:12:00Z' }] },
    }))

  it('the phone whose Tick synced late gets the info notice with a row per addition, until dismissed', async () => {
    const { container } = show(list(), { online: true, sync: twice })
    actions.tick.mockRejectedValue(down())
    await userEvent.click(screen.getByRole('button', { name: 'Tick Garlic' }))
    const stack = await waitFor(() => {
      const el = container.querySelector('.sync-notice-stack') as HTMLElement
      expect(el).not.toBeNull()
      return el
    })
    const notice = stack.querySelector('[role="status"]') as HTMLElement
    expect(notice).toHaveTextContent('Garlic was ticked twice')
    expect(notice).toHaveTextContent('Both Stock Lots were added · 1 kg in all')
    expect(within(notice).getAllByRole('button').map((b) => b.textContent)).toEqual(['Take mine back', 'Dismiss'])
    await userEvent.click(within(notice).getByRole('button', { name: /^Dismiss/ }))
    expect(container.querySelector('.sync-notice-stack')).toBeNull()
  })

  it('Take mine back takes this Tick\'s addition back, by its client id, and closes the notice', async () => {
    const { container, queue } = show(list(), { online: true, sync: twice })
    actions.tick.mockRejectedValue(down())
    await userEvent.click(screen.getByRole('button', { name: 'Tick Garlic' }))
    const sentId = actions.tick.mock.calls[0]![0].clientUuid
    const notice = await waitFor(() => {
      const el = container.querySelector('.sync-notice-stack [role="status"]') as HTMLElement
      expect(el).not.toBeNull()
      return el
    })
    await userEvent.click(within(notice).getByRole('button', { name: /^Take mine back/ }))
    expect(actions.changeTick).toHaveBeenCalledExactlyOnceWith({ ingredientId: 9, to: '2026-11-15', quantity: 0, shopId: 1, clientUuid: sentId })
    await waitFor(() => expect(container.querySelector('.sync-notice-stack')).toBeNull())
    expect(await queue.pending()).toEqual([])
  })
})

describe('ShoppingScreen: a Tick refused on sync', () => {
  const refused = async (ops: Op[]): Promise<ScanResult[]> => ops.map((o) => ({ clientUuid: o.clientUuid, status: 'rejected', error: { code: 'not_on_list', message: 'Garlic is not on the list' } }))
  const refuse = async () => {
    const view = show(list(), { online: true, sync: refused })
    actions.tick.mockRejectedValue(down())
    await userEvent.click(screen.getByRole('button', { name: 'Tick Garlic' }))
    const notice = await waitFor(() => {
      const el = view.container.querySelector('.sync-notice-stack [role="alert"]') as HTMLElement
      expect(el).not.toBeNull()
      return el
    })
    return { ...view, notice }
  }

  it('a danger notice says one fact, never silently: the Tick of Garlic, and that its Stock Lot was not added', async () => {
    const { notice } = await refuse()
    expect(notice).toHaveTextContent('Couldn’t sync the Tick of Garlic.')
    expect(notice).toHaveTextContent('Its Stock Lot was not added.')
    expect(within(notice).getAllByRole('button').map((b) => b.textContent)).toEqual(['Add to Stock', 'Dismiss'])
  })

  it('the row is open again, with the danger bar and "Tick not synced"; its tick is "Tick Garlic" and unpressed', async () => {
    const { container } = await refuse()
    const r = row(container, 'line:9')
    expect(r).toHaveAttribute('data-sync', 'failed')
    expect(r.querySelector('.list-row__meta-text')).toHaveTextContent('Tick not synced')
    expect(within(r).getByRole('button', { name: 'Tick Garlic', pressed: false })).toBeInTheDocument()
  })

  it('Add to Stock adds the Stock Lot directly (the User did buy it), with the amount the Tick carried, and closes the notice', async () => {
    const { container, notice } = await refuse()
    await userEvent.click(within(notice).getByRole('button', { name: /^Add to Stock/ }))
    expect(stockActions.addLot).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ ingredientId: 9, quantity: 500 }))
    await waitFor(() => expect(container.querySelector('.sync-notice-stack')).toBeNull())
  })

  it('Dismiss closes the notice and clears the row\'s refused mark', async () => {
    const { container, notice } = await refuse()
    await userEvent.click(within(notice).getByRole('button', { name: /^Dismiss/ }))
    await waitFor(() => expect(container.querySelector('.sync-notice-stack')).toBeNull())
    expect(row(container, 'line:9')).not.toHaveAttribute('data-sync')
  })

  it('a failed Add to Stock is a warning toast that names it, and the notice stays', async () => {
    stockActions.addLot.mockRejectedValue(down())
    const { container, notice } = await refuse()
    await userEvent.click(within(notice).getByRole('button', { name: /^Add to Stock/ }))
    await waitFor(() => expect(toast.show).toHaveBeenCalledWith(expect.objectContaining({ title: 'Couldn’t add Garlic to Stock' })))
    expect(container.querySelector('.sync-notice-stack [role="alert"]')).not.toBeNull()
  })
})
