// Round 2: the Leftover logic Today's screen used to hold inline (picking from the freezer, opening the details, the tile's
// mapping, visibility and tone) lives in one hook. Components only render and wire it.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { frozenChilli, leftover } from '../../../lib/leftovers/fixtures'
import { ConfirmProvider, ToastProvider } from '../../../ui'
import { mockApi } from '../test-utils'
import { useScreenLeftovers } from './useScreenLeftovers'

afterEach(() => vi.unstubAllGlobals())

const key = { date: '2026-11-12', mealSlotId: 2, courseId: 1 }
const asked = leftover({ id: 3, portions: 2, useBy: '2026-11-10', toAnswer: true })
const soup = leftover({ id: 4, recipeName: 'Soup', useBy: '2026-11-14' })
const frozen = frozenChilli({ id: 5 })

function setup(list: unknown[], over: { chooseKey?: typeof key | null } = {}) {
  const api = mockApi({
    'GET /api/plan/leftovers': { leftovers: list },
    'GET /api/household/settings': {},
    'GET /api/storage-places': [],
    'PUT /api/plan/2026-11-12/2/1': { recipeId: 10 },
  })
  const closeChoose = vi.fn()
  const closePlanned = vi.fn()
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={c}><ToastProvider><ConfirmProvider><MemoryRouter>{children}</MemoryRouter></ConfirmProvider></ToastProvider></QueryClientProvider>
  )
  // `leftovers` is what the plan seam holds: a payload that may predate the beta.5 fields.
  const hook = renderHook(
    () => useScreenLeftovers({ today: '2026-11-12', leftovers: list as never, choose: { key: over.chooseKey === undefined ? key : over.chooseKey, close: closeChoose }, closePlanned }),
    { wrapper },
  )
  return { ...hook, api, closeChoose, closePlanned }
}

describe('useScreenLeftovers: the tile', () => {
  it('is hidden with no Leftover, and with only frozen Leftovers that are not to answer', () => {
    expect(setup([]).result.current.tile.visible).toBe(false)
    expect(setup([frozen]).result.current.tile.visible).toBe(false)
  })
  it('is shown for a Leftover, and for a frozen one that is to answer', () => {
    expect(setup([soup]).result.current.tile.visible).toBe(true)
    expect(setup([{ ...frozen, toAnswer: true }]).result.current.tile.visible).toBe(true)
  })
  it('is in the info tone while a question is open, else the Leftover tone', () => {
    expect(setup([asked, soup]).result.current.tile.tone).toBe('info')
    expect(setup([soup]).result.current.tile.tone).toBe('leftover')
  })
  it('hands the components Leftovers in the full shape: an older payload reads as not frozen, not to answer', () => {
    const old = { id: 4, recipeId: 10, recipeName: 'Soup', portions: 2, cookedOn: '2026-11-10', useBy: '2026-11-14', fromDate: '2026-11-10', fromMealSlotId: 2 }
    expect(setup([old]).result.current.tile.leftovers[0]).toMatchObject({ frozen: false, toAnswer: false, storagePlaceId: null, plannedPortions: 0 })
  })
})

describe('useScreenLeftovers: from the freezer', () => {
  it('offers the frozen Leftovers to the chooser', async () => {
    const { result } = setup([soup, frozen])
    await waitFor(() => expect(result.current.flow.leftovers).toHaveLength(2))
    expect(result.current.chooserLeftovers.map((l: { id: number }) => l.id)).toEqual([5])
  })
  it('picking closes the chooser and PUTs the Leftover id to the open Course', async () => {
    const { result, api, closeChoose } = setup([frozen])
    await waitFor(() => expect(result.current.flow.leftovers).toHaveLength(1))
    await act(async () => { await result.current.pickLeftover(5) })
    expect(closeChoose).toHaveBeenCalled()
    expect(api.callsTo('PUT', '/api/plan/2026-11-12/2/1')[0]?.body).toEqual({ leftoverId: 5 })
  })
  it('picks nothing when no chooser is open or the Leftover is unknown', async () => {
    const closed = setup([frozen], { chooseKey: null })
    await waitFor(() => expect(closed.result.current.flow.leftovers).toHaveLength(1))
    await act(async () => { await closed.result.current.pickLeftover(5) })
    expect(closed.api.calls.filter((c) => c.method === 'PUT')).toEqual([])
    const unknown = setup([frozen])
    await waitFor(() => expect(unknown.result.current.flow.leftovers).toHaveLength(1))
    await act(async () => { await unknown.result.current.pickLeftover(99) })
    expect(unknown.api.calls.filter((c) => c.method === 'PUT')).toEqual([])
  })
})

describe('useScreenLeftovers: the From link', () => {
  it('closes the Planned Meal sheet and opens that Leftover\'s details', async () => {
    const { result, closePlanned } = setup([soup])
    await waitFor(() => expect(result.current.flow.leftovers).toHaveLength(1))
    act(() => result.current.openLeftover(4))
    expect(closePlanned).toHaveBeenCalled()
    expect(result.current.flow.details?.id).toBe(4)
  })
})
