// Beta.8 (scan): tick a Line by hand from the To get tab. The same call as the Shop screen (useShoppingActions.tick, with the
// Line's remaining quantity and a fresh client id), a toast with Undo, and a failure (offline included) that changes nothing.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { lineEntry } from '../../shop/lib/lines'
import { makeLine } from '../../shop/testData'

const api = vi.hoisted(() => ({ tick: vi.fn(), untick: vi.fn() }))
vi.mock('../../shop/api', () => ({ shopApi: api }))
const toast = vi.hoisted(() => ({ show: vi.fn() }))
vi.mock('../../../ui/Toast', () => ({ useToast: () => toast }))

import { useToGetTick } from './useToGetTick'

const passata = lineEntry(makeLine(), 'USD', 'metric')
const cheese = lineEntry(makeLine({ ingredientId: 5, name: 'Cheese', quantity: 200, pack: null }), 'USD', 'metric')
const TO = '2026-11-15'

function setup(over: { to?: string | undefined; shopId?: number | null } = {}) {
  const client = new QueryClient()
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const options = { to: TO, shopId: 2, ...over }
  return renderHook(() => useToGetTick(options), { wrapper: Wrapper })
}
const lastToast = () => toast.show.mock.calls.at(-1) as [string, { status?: string; actionLabel?: string; onAction?: () => void }?]

beforeEach(() => {
  api.tick.mockReset().mockResolvedValue({ ticked: true, lotId: 5, created: true })
  api.untick.mockReset().mockResolvedValue(undefined)
  toast.show.mockReset()
})

describe('useToGetTick', () => {
  it('ticks the Line with what is still to get, for the Shop and the range, with a fresh client id', async () => {
    const { result } = setup()
    await act(() => result.current.tick(passata))
    expect(api.tick).toHaveBeenCalledWith({ ingredientId: 2, to: TO, quantity: 1400, shopId: 2, clientUuid: expect.stringMatching(/^[0-9a-f-]{36}$/) })
  })

  it('a second tick of another Line is a new request with its own client id', async () => {
    const { result } = setup()
    await act(() => result.current.tick(passata))
    await act(() => result.current.tick(cheese))
    expect(api.tick.mock.calls[1]?.[0]).toMatchObject({ ingredientId: 5, quantity: 200 })
    expect(api.tick.mock.calls[0]?.[0].clientUuid).not.toBe(api.tick.mock.calls[1]?.[0].clientUuid)
  })

  it('answers with a toast "Passata ticked" that offers Undo', async () => {
    const { result } = setup()
    await act(() => result.current.tick(passata))
    const [message, options] = lastToast()
    expect(message).toBe('Passata ticked')
    expect(options?.actionLabel).toBe('Undo')
  })

  it('Undo unticks the Line for the same range', async () => {
    const { result } = setup()
    await act(() => result.current.tick(passata))
    await act(async () => lastToast()[1]!.onAction!())
    expect(api.untick).toHaveBeenCalledWith(2, TO)
  })

  it('a failed Undo says so and does not throw', async () => {
    api.untick.mockRejectedValue(new ApiError(0, 'network', 'offline'))
    const { result } = setup()
    await act(() => result.current.tick(passata))
    await act(async () => lastToast()[1]!.onAction!())
    await waitFor(() => expect(lastToast()[0]).toBe("Couldn't undo that tick. Try again."))
    expect(lastToast()[1]?.status).toBe('error')
  })

  it('the Line is pending while the request runs, and a second tap of it is ignored', async () => {
    let finish!: () => void
    api.tick.mockReturnValue(new Promise((resolve) => (finish = () => resolve({ ticked: true, lotId: null, created: false }))))
    const { result } = setup()
    let first!: Promise<void>
    act(() => {
      first = result.current.tick(passata)
    })
    expect(result.current.pendingKeys.has('line:2')).toBe(true)
    await act(() => result.current.tick(passata))
    expect(api.tick).toHaveBeenCalledTimes(1)
    await act(async () => {
      finish()
      await first
    })
    expect(result.current.pendingKeys.size).toBe(0)
  })

  it('offline (or any failure): an error toast, no success toast, and the Line is free to tick again', async () => {
    api.tick.mockRejectedValueOnce(new ApiError(0, 'network', 'offline'))
    const { result } = setup()
    await act(() => result.current.tick(passata))
    expect(toast.show).toHaveBeenCalledTimes(1)
    expect(lastToast()[0]).toBe("Couldn't tick Passata. Try again.")
    expect(lastToast()[1]?.status).toBe('error')
    expect(result.current.pendingKeys.size).toBe(0)
    await act(() => result.current.tick(passata))
    expect(lastToast()[0]).toBe('Passata ticked')
  })

  it('does nothing before the Shopping List is in (no range yet) or for an entry without an Ingredient', async () => {
    const early = setup({ to: undefined })
    await act(() => early.result.current.tick(passata))
    const free = setup()
    await act(() => free.result.current.tick({ ...passata, ingredientId: null }))
    expect(api.tick).not.toHaveBeenCalled()
    expect(toast.show).not.toHaveBeenCalled()
  })

  it('no Shop picked ticks for any Shop (null)', async () => {
    const { result } = setup({ shopId: null })
    await act(() => result.current.tick(passata))
    expect(api.tick).toHaveBeenCalledWith(expect.objectContaining({ shopId: null }))
  })
})
