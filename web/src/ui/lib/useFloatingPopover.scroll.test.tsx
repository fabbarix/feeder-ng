// b8-pantry review (G1): the Filters popover's body scrolls inside the cap useFloatingPopover sets. Placing the popover again
// un-caps it to measure, which clamps a scrolled body back to its top; it did so on the body's own scroll event (the window
// listener captures every scroll), so the body could never scroll. A scroll inside the popover does not place it again, and a
// placement (after a render, or a page scroll) keeps the body where it was scrolled to.
import { act, render } from '@testing-library/react'
import { useRef, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFloatingPopover } from './useFloatingPopover'

function Panel({ tick }: { tick: number }): ReactNode {
  const anchor = useRef<HTMLButtonElement>(null)
  const popover = useRef<HTMLDivElement>(null)
  useFloatingPopover(true, anchor, popover, 'flex')
  return (
    <>
      <button ref={anchor}>Filters</button>
      <div ref={popover} className="pop" data-tick={tick}>
        <div className="body">content</div>
      </div>
    </>
  )
}

const rect = (top: number, height: number) => ({ top, left: 0, width: 300, height, right: 300, bottom: top + height, x: 0, y: top, toJSON: () => ({}) }) as DOMRect

let bodyTop = 0
beforeEach(() => {
  vi.stubGlobal('innerHeight', 768)
  vi.stubGlobal('innerWidth', 1024)
  bodyTop = 0
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('pop')) {
      // Measured un-capped, the body no longer overflows: the browser clamps its scroll position to 0.
      if ((this as HTMLElement).style.maxHeight === '') bodyTop = 0
      return rect(60, 900)
    }
    return rect(10, 40)
  })
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('body') ? bodyTop : 0
    },
    set(this: HTMLElement, v: number) {
      if (this.classList.contains('body')) bodyTop = v
    },
  })
})
afterEach(() => {
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollTop
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useFloatingPopover and a scrolled body', () => {
  it('does not place the popover again on a scroll inside it', () => {
    const { container } = render(<Panel tick={0} />)
    const pop = container.querySelector<HTMLElement>('.pop')!
    pop.style.maxHeight = '123px'
    bodyTop = 200
    act(() => {
      container.querySelector('.body')!.dispatchEvent(new Event('scroll'))
    })
    expect(pop.style.maxHeight).toBe('123px')
    expect(bodyTop).toBe(200)
  })
  it('places it again on a page scroll, and keeps the body where it was scrolled to', () => {
    const { container } = render(<Panel tick={0} />)
    const pop = container.querySelector<HTMLElement>('.pop')!
    pop.style.maxHeight = '123px'
    bodyTop = 200
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    expect(pop.style.maxHeight).not.toBe('123px')
    expect(bodyTop).toBe(200)
  })
  it('keeps the body where it was scrolled to across a render (a chip pressed at the bottom)', () => {
    const { rerender } = render(<Panel tick={0} />)
    bodyTop = 180
    rerender(<Panel tick={1} />)
    expect(bodyTop).toBe(180)
  })
})
