// FU-1: the sticky action bar publishes its measured height as --sticky-bar-clearance on the document root (jsdom has no layout:
// offsetHeight is stubbed, and ResizeObserver is a fake that the test fires by hand).
import { act, render } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StickyActionBar } from './StickyActionBar'
import { STICKY_BAR_CLEARANCE } from './useStickyBarClearance'

type Observed = { callback: ResizeObserverCallback; disconnected: boolean; targets: Element[] }
let observers: Observed[] = []
let heightOf = 121

beforeEach(() => {
  observers = []
  heightOf = 121
  vi.stubGlobal(
    'ResizeObserver',
    class {
      private record: Observed
      constructor(callback: ResizeObserverCallback) {
        this.record = { callback, disconnected: false, targets: [] }
        observers.push(this.record)
      }
      observe(target: Element) {
        this.record.targets.push(target)
      }
      disconnect() {
        this.record.disconnected = true
      }
    },
  )
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('sticky-action-bar') ? heightOf : 0
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.documentElement.style.removeProperty(STICKY_BAR_CLEARANCE)
})

describe('useStickyBarClearance (through StickyActionBar)', () => {
  it('publishes the bar height on the document root when mounted', () => {
    render(
      <StickyActionBar>
        <button type="button">Save</button>
      </StickyActionBar>,
    )
    expect(document.documentElement.style.getPropertyValue(STICKY_BAR_CLEARANCE)).toBe('121px')
  })

  it('follows the bar when its size changes (the ResizeObserver callback re-publishes)', () => {
    render(
      <StickyActionBar>
        <button type="button">Save</button>
      </StickyActionBar>,
    )
    heightOf = 69
    act(() => observers[0]!.callback([], {} as ResizeObserver))
    expect(document.documentElement.style.getPropertyValue(STICKY_BAR_CLEARANCE)).toBe('69px')
  })

  it('observes the bar element itself', () => {
    render(
      <StickyActionBar>
        <button type="button">Save</button>
      </StickyActionBar>,
    )
    expect(observers[0]!.targets[0]).toHaveClass('sticky-action-bar')
  })

  it('on unmount disconnects the observer and removes the property, so the stylesheet default applies again', () => {
    const { unmount } = render(
      <StickyActionBar>
        <button type="button">Save</button>
      </StickyActionBar>,
    )
    unmount()
    expect(observers[0]!.disconnected).toBe(true)
    expect(document.documentElement.style.getPropertyValue(STICKY_BAR_CLEARANCE)).toBe('')
  })
})

describe('useStickyBarClearance: several bars, no change, StrictMode, no ResizeObserver', () => {
  const bar = (label: string) => (
    <StickyActionBar>
      <button type="button">{label}</button>
    </StickyActionBar>
  )
  const published = () => document.documentElement.style.getPropertyValue(STICKY_BAR_CLEARANCE)

  it('two bars at once publish the largest height; the property goes only when the last bar unmounts', () => {
    const heights = [121, 69]
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      if (!this.classList.contains('sticky-action-bar')) return 0
      return heights[Array.from(document.querySelectorAll('.sticky-action-bar')).indexOf(this)] ?? 0
    })
    const a = render(bar('A'))
    const b = render(bar('B'))
    expect(published()).toBe('121px')
    a.unmount() // the large bar goes: the remaining one (now index 0) is measured again
    heights[0] = 69
    act(() => observers.filter((o) => !o.disconnected).forEach((o) => o.callback([], {} as ResizeObserver)))
    expect(published()).toBe('69px')
    b.unmount()
    expect(published()).toBe('')
  })

  it('unmounting one of two bars keeps the property while the other is mounted', () => {
    const a = render(bar('A'))
    const b = render(bar('B'))
    b.unmount()
    expect(published()).not.toBe('')
    a.unmount()
    expect(published()).toBe('')
  })

  it('skips setProperty when the height is unchanged', () => {
    const spy = vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty')
    render(bar('A'))
    const mine = () => spy.mock.calls.filter((c) => c[0] === STICKY_BAR_CLEARANCE).length
    const first = mine()
    expect(first).toBe(1)
    act(() => observers[0]!.callback([], {} as ResizeObserver))
    act(() => observers[0]!.callback([], {} as ResizeObserver))
    expect(mine()).toBe(first)
  })

  it('a StrictMode double mount still ends published', () => {
    render(<StrictMode>{bar('A')}</StrictMode>)
    expect(published()).toBe('121px')
  })

  it('without ResizeObserver nothing is published and nothing throws', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    expect(() => render(bar('A'))).not.toThrow()
    expect(published()).toBe('')
  })
})
