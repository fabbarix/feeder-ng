// B9-32 (PC-11): usePlanGrid measures the grid's container with a ResizeObserver and answers columns, spans and which days have the
// whole row. TEST-AUTHOR tests: the hook is a stub that throws.
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installResizeObserver } from '../test-utils.grid'
import { usePlanGrid, type PlanGridLayout } from './usePlanGrid'

let latest: PlanGridLayout
function Probe({ count }: { count: number }) {
  const { ref, ...layout } = usePlanGrid(count)
  latest = layout
  return <div ref={ref} data-testid="grid" />
}

let ro: ReturnType<typeof installResizeObserver>
beforeEach(() => {
  ro = installResizeObserver()
})
afterEach(() => ro.restore())

describe('usePlanGrid', () => {
  it('is one column, every day 12, before the container is measured (and on a phone)', () => {
    render(<Probe count={7} />)
    expect(latest.columns).toBe(1)
    expect(latest.spans).toEqual([12, 12, 12, 12, 12, 12, 12])
    expect(latest.rows.every((r) => !r)).toBe(true)
  })

  it('observes the element it is given, once', () => {
    const { getByTestId } = render(<Probe count={7} />)
    expect(ro.observers).toHaveLength(1)
    expect(ro.observers[0]!.targets).toEqual([getByTestId('grid')])
  })

  it.each([
    [772, 2, [6, 6, 6, 6, 6, 6, 12]], // 820 wide: Sat has the full row
    [1044, 3, [4, 4, 4, 4, 4, 4, 12]], // laptop 1180 with the rail... 1044 > 1031
    [1136, 3, [4, 4, 4, 4, 4, 4, 12]], // desktop 1440
    [1480, 4, [3, 3, 3, 3, 4, 4, 4]], // 1920 and 2560: Thu, Fri and Sat share the last row
  ])('a container of %i px: %i columns, spans %j', (width, columns, spans) => {
    render(<Probe count={7} />)
    act(() => ro.fire(width))
    expect(latest.columns).toBe(columns)
    expect(latest.spans).toEqual(spans)
  })

  it('a day that has the whole row (span 12) lays its Meal Slots side by side, but only when there is more than one column', () => {
    render(<Probe count={7} />)
    act(() => ro.fire(772))
    expect(latest.rows).toEqual([false, false, false, false, false, false, true])
    act(() => ro.fire(375))
    expect(latest.rows.every((r) => !r)).toBe(true) // one column: nothing to fill
    act(() => ro.fire(1480))
    expect(latest.rows.every((r) => !r)).toBe(true) // four columns: the last three share the row
  })

  it('follows the container as it is resized (a window dragged wider)', () => {
    render(<Probe count={7} />)
    act(() => ro.fire(700))
    expect(latest.columns).toBe(2)
    act(() => ro.fire(1100))
    expect(latest.columns).toBe(3)
    act(() => ro.fire(500))
    expect(latest.columns).toBe(1)
  })

  it('works for any Planning Horizon: the spans follow `count`', () => {
    const { rerender } = render(<Probe count={7} />)
    act(() => ro.fire(1480))
    rerender(<Probe count={5} />)
    expect(latest.spans).toEqual([3, 3, 3, 3, 12])
    rerender(<Probe count={14} />)
    expect(latest.spans).toHaveLength(14)
    expect(latest.spans.slice(-2)).toEqual([6, 6])
  })

  it('disconnects its observer when the grid goes away', () => {
    const { unmount } = render(<Probe count={7} />)
    unmount()
    expect(ro.observers.every((o) => o.disconnected)).toBe(true)
  })

  it('where there is no ResizeObserver (an old webview, a test) it stays at one column and does not throw', () => {
    ro.restore()
    expect(() => render(<Probe count={7} />)).not.toThrow()
    expect(latest.columns).toBe(1)
  })
})
