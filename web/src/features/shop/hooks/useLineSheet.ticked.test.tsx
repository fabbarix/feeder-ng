// B9-34 (SSP-18): the Line sheet controller gains the two actions of a ticked Line. Each runs its handler once and closes the sheet; an
// action the sheet does not offer is ignored.
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { lineEntry } from '../lib/lines'
import { makeAddition, makeGarlic, makeTick } from '../testData'
import { useLineSheet } from './useLineSheet'

const handlers = () => ({ onNotNeeded: vi.fn(), onNeededAfterAll: vi.fn(), onMarkIt: vi.fn(), onDelete: vi.fn(), onChangeAmount: vi.fn(), onUntick: vi.fn() })
const ticked = lineEntry(makeGarlic({ ticked: true, quantity: 0, tick: makeTick() }), 'USD', 'metric')

describe('useLineSheet: a ticked Line', () => {
  it('offers Change amount and Untick, and Untick runs onUntick once and closes', () => {
    const h = handlers()
    const { result } = renderHook(() => useLineSheet(h))
    act(() => result.current.open(ticked, 'ticked'))
    expect(result.current.actions).toEqual(['change-amount', 'untick'])
    act(() => result.current.run('untick'))
    expect(h.onUntick).toHaveBeenCalledExactlyOnceWith(ticked)
    expect(result.current.entry).toBeNull()
  })

  it('Change amount runs onChangeAmount with the entry', () => {
    const h = handlers()
    const { result } = renderHook(() => useLineSheet(h))
    act(() => result.current.open(ticked, 'ticked'))
    act(() => result.current.run('change-amount'))
    expect(h.onChangeAmount).toHaveBeenCalledExactlyOnceWith(ticked)
  })

  it('ignores Change amount when the viewer has no hand addition (a stale button cannot act)', () => {
    const h = handlers()
    const sam = lineEntry(makeGarlic({ ticked: true, quantity: 0, tick: makeTick({ additions: [makeAddition({ who: 'Sam', mine: false })] }) }), 'USD', 'metric')
    const { result } = renderHook(() => useLineSheet(h))
    act(() => result.current.open(sam, 'ticked'))
    act(() => result.current.run('change-amount'))
    expect(h.onChangeAmount).not.toHaveBeenCalled()
    expect(result.current.entry).toBe(sam)
  })
})
