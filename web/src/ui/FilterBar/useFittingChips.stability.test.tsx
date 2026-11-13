// hf-recipes-filter round 3: the chip line must settle. bb354d3c's round 2 measured the shown chips (min-inline-size 4.5 rem, so
// "Side" was 72 px) while nothing was hidden, and the copy (no min, "Side" 64 px) once a chip was hidden. With the line inside
// that 8 px gap, every fit flipped the other way, the layout effect looped and React threw #185 ("Maximum update depth
// exceeded"): the page showed "Something went wrong" at 430 px (docs/design/recipes-filter.md 14).
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useFittingChips, type ChipLineMetrics } from './useFittingChips'

const line = () => ({ current: Object.assign(document.createElement('div'), {}) })

afterEach(() => vi.restoreAllMocks())

/**
 * A measure that disagrees with itself the way round 2 did: "Side" is 72 px while every chip shows, 64 px once one is hidden
 * (the copy). The Tag is 200 px, the gap 8 px, "+1" 32 px. All visible needs 280 px by the first, 272 px by the second.
 */
function disagreeing(available: number, state: { hidden: number }) {
  return (): ChipLineMetrics => ({ available, widths: [state.hidden > 0 ? 64 : 72, 200], gap: 8, plusWidth: 32 })
}

describe('useFittingChips settles when its two measurements disagree', () => {
  it.each([273, 276, 279])('at %i px (inside the 272-280 gap) it renders a bounded number of times and keeps one chip hidden', (available) => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const state = { hidden: 0 }
    let renders = 0
    const el = line()
    const run = () =>
      renderHook(() => {
        renders++
        const r = useFittingChips(el, 2, disagreeing(available, state))
        state.hidden = r.hidden
        return r
      })
    let result: ReturnType<typeof run>['result'] | undefined
    expect(() => {
      result = run().result
    }).not.toThrow()
    expect(renders).toBeLessThanOrEqual(6)
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/Maximum update depth/)
    expect(result!.current).toEqual({ visible: 1, hidden: 1 })
  })

  it('a re-render with nothing changed keeps the same answer and does not fit again into a loop', () => {
    const state = { hidden: 0 }
    let renders = 0
    const el = line()
    const { result, rerender } = renderHook(() => {
      renders++
      const r = useFittingChips(el, 2, disagreeing(276, state))
      state.hidden = r.hidden
      return r
    })
    const before = renders
    rerender()
    rerender()
    expect(result.current).toEqual({ visible: 1, hidden: 1 })
    expect(renders - before).toBeLessThanOrEqual(4)
  })

  it('with room to spare beyond the margin, every chip shows again', () => {
    const state = { hidden: 0 }
    const el = line()
    const { result } = renderHook(() => {
      const r = useFittingChips(el, 2, disagreeing(320, state))
      state.hidden = r.hidden
      return r
    })
    expect(result.current).toEqual({ visible: 2, hidden: 0 })
  })
})
