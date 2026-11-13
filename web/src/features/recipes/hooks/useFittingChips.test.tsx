// hf-recipes-filter: how many active filter chips fit on their one line, the rest as "+N" (docs/design/recipes-filter.md 5.4, 6).
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useFittingChips, type ChipLineMetrics } from './useFittingChips'

const lineWith = () => ({ current: document.createElement('div') })

describe('useFittingChips', () => {
  it('without a measurement (jsdom lays nothing out) every chip is visible', () => {
    const { result } = renderHook(() => useFittingChips(lineWith(), 2))
    expect(result.current).toEqual({ visible: 2, hidden: 0 })
  })
  it('with no line element every chip is visible', () => {
    const { result } = renderHook(() => useFittingChips({ current: null }, 2))
    expect(result.current).toEqual({ visible: 2, hidden: 0 })
  })
  it('uses the measured widths: what does not fit goes into +N', () => {
    const measure = (): ChipLineMetrics => ({ available: 180, widths: [80, 100], gap: 8, plusWidth: 32 })
    const { result } = renderHook(() => useFittingChips(lineWith(), 2, measure))
    expect(result.current).toEqual({ visible: 1, hidden: 1 })
  })
  it('measures again when the number of chips changes', () => {
    let widths = [80]
    const measure = (): ChipLineMetrics => ({ available: 180, widths, gap: 8, plusWidth: 32 })
    const line = lineWith()
    const { result, rerender } = renderHook(({ n }) => useFittingChips(line, n, measure), { initialProps: { n: 1 } })
    expect(result.current).toEqual({ visible: 1, hidden: 0 })
    widths = [80, 100]
    rerender({ n: 2 })
    expect(result.current).toEqual({ visible: 1, hidden: 1 })
  })
  it('no chips: nothing to show', () => {
    const { result } = renderHook(() => useFittingChips(lineWith(), 0))
    expect(result.current).toEqual({ visible: 0, hidden: 0 })
  })
})
