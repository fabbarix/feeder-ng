// b5-ufw (docs/dev/design/b5-ufw.md §5): useMarkCooked carries the Used from picks of the Course.
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CookPreviewWithLots } from '../api.usedFrom'
import { planStrings } from '../strings'
import { meal, mockApi, wrapper } from '../test-utils'
import { usedFromStrings } from '../usedFromStrings'
import { useMarkCooked } from './useMarkCooked'

vi.mock('./useCookContext', () => ({ useCookContext: () => ({ unitSystem: 'metric', today: '2026-11-10' }) }))

afterEach(() => vi.unstubAllGlobals())

const key = { date: '2026-11-10', mealSlotId: 2, courseId: 1 }
const lot = (id: number, quantity: number, place: string) => ({ id, quantity, purchased: '2026-11-09', goesOff: '2026-11-14', storagePlaceName: place })
const preview = (lots = [lot(1, 500, 'Fridge'), lot(2, 600, 'Freezer')]): CookPreviewWithLots => ({
  meal: meal({ recipeName: 'Roast chicken', courseId: 1, courseName: 'Main' }), fresh: true, batches: 1, yield: 4, portionsNeeded: 2,
  proposedLeftover: 2, maxLeftover: 4, leftoverUseBy: '2026-11-13',
  needs: [{ ingredientId: 11, ingredient: 'Chicken thighs', quantity: 800, baseUnit: 'g', lots }],
})
const PREVIEW = 'GET /api/plan/2026-11-10/2/1/cook'
const COOKED = 'POST /api/plan/2026-11-10/2/1/cooked'
const cookedPath = '/api/plan/2026-11-10/2/1/cooked'
const refused = { status: 422, json: { error: { code: 'used_from_invalid', message: 'A Stock Lot changed' } } }

async function loaded() {
  const hook = renderHook(() => useMarkCooked(key), { wrapper })
  await waitFor(() => expect(hook.result.current.preview).not.toBeNull())
  return hook
}

describe('useMarkCooked: Used from', () => {
  it('offers the Used from lines of the preview needs, in the household Unit System and date', async () => {
    mockApi({ [PREVIEW]: preview() })
    const { result } = await loaded()
    const uf = result.current.usedFrom!
    expect(uf.summary(1)).toBe('Soonest to go off first')
    expect(uf.lines(1)[0]!.title).toBe('Chicken thighs · 800 g')
    expect(uf.lines(1)[0]!.lots[0]!.meta).toBe('Good until Sat · Bought 9 Nov') // within the week reads as a weekday
  })

  it('a Good until date more than a week out reads as a day and month', async () => {
    mockApi({ [PREVIEW]: preview([{ ...lot(1, 500, 'Fridge'), goesOff: '2026-11-24' }]) })
    const { result } = await loaded()
    expect(result.current.usedFrom!.lines(1)[0]!.lots[0]!.meta).toBe('Good until 24 Nov · Bought 9 Nov')
  })

  it('sends no usedFrom when nothing was chosen (exactly as before)', async () => {
    const api = mockApi({ [PREVIEW]: preview(), [COOKED]: { warnings: [] } })
    const { result } = await loaded()
    await act(async () => {
      await result.current.confirm()
    })
    expect(api.callsTo('POST', cookedPath)[0]!.body).toEqual({ leftoverPortions: 2 })
  })

  it('sends the chosen Lots as usedFrom with the edited Leftover', async () => {
    const api = mockApi({ [PREVIEW]: preview(), [COOKED]: { warnings: [] } })
    const { result } = await loaded()
    act(() => result.current.setLeftover(1))
    act(() => result.current.usedFrom!.toggle(1, 11, 2, true))
    await act(async () => {
      await result.current.confirm()
    })
    expect(api.callsTo('POST', cookedPath)[0]!.body).toEqual({
      leftoverPortions: 1,
      usedFrom: [{ ingredientId: 11, lots: [{ lotId: 2, quantity: 600 }] }],
    })
  })

  it('a 422 used_from_invalid shows the refusal copy, keeps the sheet flow open (null) and reloads the preview', async () => {
    let previews = 0
    const api = mockApi({
      [PREVIEW]: () => (++previews === 1 ? preview() : preview([lot(3, 700, 'Fridge')])),
      [COOKED]: refused,
    })
    const { result } = await loaded()
    act(() => result.current.usedFrom!.toggle(1, 11, 1, true))
    let out: unknown = 'unset'
    await act(async () => {
      out = await result.current.confirm()
    })
    expect(out).toBeNull()
    expect(result.current.result).toBeNull()
    expect(result.current.error).toBe(usedFromStrings.refused)
    await waitFor(() => expect(api.callsTo('GET', '/api/plan/2026-11-10/2/1/cook')).toHaveLength(2))
    await waitFor(() => expect(result.current.usedFrom!.lines(1)[0]!.lots.map((l) => l.lotId)).toEqual([3]))
    expect(result.current.usedFrom!.entries(1)).toBeUndefined() // the old picks refer to Lots that are gone
  })

  it('any other failure keeps the generic cooked error and does not reload the preview', async () => {
    const api = mockApi({ [PREVIEW]: preview(), [COOKED]: { status: 500, json: { error: { code: 'internal', message: 'x' } } } })
    const { result } = await loaded()
    await act(async () => {
      await result.current.confirm()
    })
    expect(result.current.error).toBe(planStrings.cookedError)
    expect(api.callsTo('GET', '/api/plan/2026-11-10/2/1/cook')).toHaveLength(1)
  })
})
