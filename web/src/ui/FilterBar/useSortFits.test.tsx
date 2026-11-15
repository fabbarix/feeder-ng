// B9-15 (DS-03): useSortFits(rowRef, measure?) tells whether the Sort chip fits with its value shown. A ResizeObserver watches the row; the
// measure reads the row, the view control, the hidden copy's natural Sort width and the gap. jsdom lays nothing out: unmeasured fits.
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSortFits, type SortRowMetrics } from './useSortFits'

const rowRef = () => ({ current: document.createElement('div') })

afterEach(() => vi.unstubAllGlobals())

describe('useSortFits', () => {
  it('without a measurement (jsdom) the Sort fits: it shows its value', () => {
    expect(renderHook(() => useSortFits(rowRef())).result.current.fits).toBe(true)
  })
  it('with no row element it fits', () => {
    expect(renderHook(() => useSortFits({ current: null })).result.current.fits).toBe(true)
  })
  it('does not fit when the natural width is more than the room beside the view control', () => {
    const measure = (): SortRowMetrics => ({ row: 288, view: 150, natural: 140, gap: 8 })
    expect(renderHook(() => useSortFits(rowRef(), measure)).result.current.fits).toBe(false)
  })
  it('fits when it does', () => {
    const measure = (): SortRowMetrics => ({ row: 288, view: 150, natural: 130, gap: 8 })
    expect(renderHook(() => useSortFits(rowRef(), measure)).result.current.fits).toBe(true)
  })
  it('shows the value again as soon as it fits: after the row grows, and the observer fires', () => {
    let row = 288
    let fire: () => void = () => {}
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          fire = cb
        }
        observe() {}
        disconnect() {}
      },
    )
    const measure = (): SortRowMetrics => ({ row, view: 150, natural: 140, gap: 8 })
    const { result } = renderHook(() => useSortFits(rowRef(), measure))
    expect(result.current.fits).toBe(false)
    row = 320
    act(() => fire())
    expect(result.current.fits).toBe(true)
    row = 288
    act(() => fire())
    expect(result.current.fits).toBe(false)
  })
  it('a shorter value (a smaller natural width) fits again after a re-render', () => {
    let natural = 140
    const measure = (): SortRowMetrics => ({ row: 288, view: 150, natural, gap: 8 })
    const ref = rowRef()
    const { result, rerender } = renderHook(() => useSortFits(ref, measure))
    expect(result.current.fits).toBe(false)
    natural = 100
    rerender()
    expect(result.current.fits).toBe(true)
  })
})
