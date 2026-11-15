import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { ToastProvider } from '../../../ui/Toast'
import { makeList } from '../testData'

// B9-20 (RES-06): a failed Shop action is a toast with the R-D anatomy ("Couldn’t mark Passata Not needed"), not the inline
// ErrorState and never the raw client text ("The network is unreachable"). The inline ErrorState stays for load failures.
const listHook = vi.hoisted(() => ({ useShoppingList: vi.fn() }))
vi.mock('../hooks/useShoppingList', () => listHook)
const actions = vi.hoisted(() => ({
  tick: vi.fn(), untick: vi.fn(), addExtra: vi.fn(), deleteExtra: vi.fn(), tickExtra: vi.fn(), untickExtra: vi.fn(), notNeeded: vi.fn(), neededAfterAll: vi.fn(),
}))
vi.mock('../hooks/useShoppingActions', () => ({ useShoppingActions: () => actions }))
const choice = vi.hoisted(() => ({ useShopChoice: vi.fn(), setShopId: vi.fn() }))
vi.mock('../hooks/useShopChoice', () => ({ useShopChoice: choice.useShopChoice }))
const here = vi.hoisted(() => ({ useShopHere: vi.fn() }))
vi.mock('../hooks/useShopHere', () => here)
vi.mock('../../shops/components/AddShopSheet', () => ({ AddShopSheet: () => null }))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../stock/hooks/useIngredientChoices', () => ({ useIngredientChoices: () => ({ choices: [], isLoading: false }) }))
// B9-34: the ticked Line's sheet shows times in the Household zone, read from /api/me (app/useMe)
vi.mock('../../../app/useMe', () => ({ useMe: () => ({ data: { householdTimeZone: 'UTC' } }) }))
import { ShoppingScreen } from './ShoppingScreen'
// B9-43: the screen reads Stock Lots (Put away) and the Recipe Assistant's status (Read the receipt) through react-query
const testQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })


function show() {
  listHook.useShoppingList.mockReturnValue({ data: makeList(), isLoading: false, error: null, stale: false, status: 'ready', state: 'ready', retry: vi.fn() })
  render(
    <ToastProvider>
      <QueryClientProvider client={testQueryClient()}>
    <MemoryRouter initialEntries={['/shop']}>
        <Routes>
          <Route path="/shop" element={<ShoppingScreen />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
    </ToastProvider>,
  )
}
beforeEach(() => {
  listHook.useShoppingList.mockReset()
  choice.useShopChoice.mockReturnValue({ shops: [{ id: 1, name: 'Coop' }], shopId: 1, setShopId: choice.setShopId, isLoading: false })
  here.useShopHere.mockReset().mockReturnValue({ status: 'idle', anyLocated: false, find: vi.fn() })
  for (const f of Object.values(actions)) f.mockReset().mockResolvedValue(undefined)
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
})

const notNeeded = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Passata' }))
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Passata' })).getByRole('button', { name: 'Not needed' }))
}

describe('ShoppingScreen failed actions', () => {
  it('a server error is one error toast: "Couldn’t mark Passata Not needed", the body, and Try again that runs the same action', async () => {
    actions.notNeeded.mockRejectedValue(new ApiError(500, 'internal', 'boom'))
    show()
    await notNeeded()
    const toast = (await screen.findByText('Couldn’t mark Passata Not needed')).closest('.toast') as HTMLElement
    expect(toast).not.toBeNull()
    expect(within(toast).getByText('Your choices are still on the screen.')).toBeInTheDocument()
    await userEvent.click(within(toast).getByRole('button', { name: 'Try again' }))
    expect(actions.notNeeded).toHaveBeenCalledTimes(2)
    expect(actions.notNeeded.mock.calls[1]).toEqual(actions.notNeeded.mock.calls[0])
  })

  it('offline (status 0): the offline toast, "Feeder is offline", no Try again, and never the raw client text', async () => {
    actions.notNeeded.mockRejectedValue(new ApiError(0, 'network', 'The network is unreachable'))
    show()
    await notNeeded()
    const toast = (await screen.findByText('Couldn’t mark Passata Not needed')).closest('.toast') as HTMLElement
    expect(within(toast).getByText('Feeder is offline')).toBeInTheDocument()
    expect(within(toast).queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.queryByText(/network is unreachable/i)).toBeNull()
  })

  it('a refusal with its own message (a 409) is that one line in a toast', async () => {
    actions.notNeeded.mockRejectedValue(new ApiError(409, 'not_on_list', 'That line is not on the list.'))
    show()
    await notNeeded()
    expect(await screen.findByText('That line is not on the list.')).toBeInTheDocument()
    expect(screen.getByText('That line is not on the list.').closest('.toast')).not.toBeNull()
  })

  it('there is no inline ErrorState for an action: that is for load failures only', async () => {
    actions.notNeeded.mockRejectedValue(new ApiError(500, 'internal', 'boom'))
    show()
    await notNeeded()
    await screen.findByText('Couldn’t mark Passata Not needed')
    expect(document.querySelector('.error-state')).toBeNull()
  })
})
