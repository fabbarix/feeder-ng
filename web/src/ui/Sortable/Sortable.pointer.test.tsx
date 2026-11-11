// Pointer drag of ui/Sortable with simulated pointer events (docs/dev/design/sort-drag.md sections 2.1 and 2.3).
// Rows are 50 px tall at y = 0, 50, 100 (see sortable.test-helper); the handle of row 0 is grabbed at y = 25.
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { Demo, layoutRows, pointer, shown } from './sortable.test-helper'

let onReorder: Mock<(from: number, to: number) => void>
const setPointerCapture = vi.fn()
const releasePointerCapture = vi.fn()

beforeEach(() => {
  onReorder = vi.fn<(from: number, to: number) => void>()
  Element.prototype.setPointerCapture = setPointerCapture
  Element.prototype.releasePointerCapture = releasePointerCapture
  const { container } = render(<Demo onReorder={onReorder} />)
  layoutRows(container)
})
afterEach(() => vi.restoreAllMocks())

const handle = (name = 'garlic') => screen.getByRole('button', { name: `Reorder ${name}` })
const item = (i: number) => document.querySelector(`[data-sortable-index="${i}"]`) as HTMLElement
const state = (i: number) => item(i).getAttribute('data-state')

describe('Sortable: starting a drag', () => {
  it('captures the pointer on pointer down but does not start dragging yet', () => {
    pointer(handle(), 'pointerdown', { clientY: 25, pointerId: 7 })
    expect(setPointerCapture).toHaveBeenCalledWith(7)
    expect(state(0)).toBe('idle')
  })
  it('a mouse needs to travel more than 4 px', () => {
    pointer(handle(), 'pointerdown', { clientY: 25 })
    pointer(handle(), 'pointermove', { clientY: 28 })
    expect(state(0)).toBe('idle')
    pointer(handle(), 'pointermove', { clientY: 31 })
    expect(state(0)).toBe('dragging')
  })
  it('touch and pen need more than 8 px, so a tap or a small wobble on the handle never drags', () => {
    pointer(handle(), 'pointerdown', { clientY: 25, pointerType: 'touch' })
    pointer(handle(), 'pointermove', { clientY: 31, pointerType: 'touch' })
    expect(state(0)).toBe('idle')
    pointer(handle(), 'pointermove', { clientY: 35, pointerType: 'touch' })
    expect(state(0)).toBe('dragging')
  })
  it('a press and release under the threshold changes nothing and announces nothing', () => {
    pointer(handle(), 'pointerdown', { clientY: 25 })
    pointer(handle(), 'pointerup', { clientY: 26 })
    expect(onReorder).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('')
  })
  it('ignores the secondary mouse button', () => {
    pointer(handle(), 'pointerdown', { clientY: 25, button: 2 })
    pointer(handle(), 'pointermove', { clientY: 80, button: 2 })
    expect(state(0)).toBe('idle')
    expect(setPointerCapture).not.toHaveBeenCalled()
  })
  it('announces the pick up without the keyboard hint', () => {
    pointer(handle(), 'pointerdown', { clientY: 25 })
    pointer(handle(), 'pointermove', { clientY: 40 })
    expect(screen.getByRole('status')).toHaveTextContent('Picked up garlic. Position 1 of 3.')
    expect(screen.getByRole('status')).not.toHaveTextContent(/arrow keys/)
  })
})

describe('Sortable: dragging', () => {
  it('the dragged item follows the pointer through --sortable-dy', () => {
    pointer(handle(), 'pointerdown', { clientY: 25 })
    pointer(handle(), 'pointermove', { clientY: 60 })
    expect(item(0).style.getPropertyValue('--sortable-dy')).toBe('35px')
    pointer(handle(), 'pointermove', { clientY: 20 })
    expect(item(0).style.getPropertyValue('--sortable-dy')).toBe('-5px')
  })
  it('previews the new order as the pointer crosses into other rows and announces each move', () => {
    pointer(handle(), 'pointerdown', { clientY: 25 })
    pointer(handle(), 'pointermove', { clientY: 70 })
    expect(shown()).toEqual(['flour', 'garlic', 'salt'])
    expect(screen.getByRole('status')).toHaveTextContent('garlic moved to position 2 of 3.')
    pointer(handle(), 'pointermove', { clientY: 130 })
    expect(shown()).toEqual(['flour', 'salt', 'garlic'])
    expect(screen.getByRole('status')).toHaveTextContent('garlic moved to position 3 of 3.')
    pointer(handle(), 'pointermove', { clientY: 30 })
    expect(shown()).toEqual(['garlic', 'flour', 'salt'])
  })
  it('does not announce again while the pointer stays in the same row', () => {
    pointer(handle(), 'pointerdown', { clientY: 25 })
    pointer(handle(), 'pointermove', { clientY: 70 })
    const live = screen.getByRole('status')
    const before = live.textContent
    pointer(handle(), 'pointermove', { clientY: 80 })
    expect(live.textContent).toBe(before)
  })
  it('clamps to the last row when the pointer goes far past the list', () => {
    pointer(handle(), 'pointerdown', { clientY: 25 })
    pointer(handle(), 'pointermove', { clientY: 900 })
    expect(shown()).toEqual(['flour', 'salt', 'garlic'])
    pointer(handle(), 'pointermove', { clientY: -400 })
    expect(shown()).toEqual(['garlic', 'flour', 'salt'])
  })
})

describe('Sortable: dropping and cancelling', () => {
  it('pointer up commits once with the original and final index, and announces the drop', () => {
    pointer(handle(), 'pointerdown', { clientY: 25 })
    pointer(handle(), 'pointermove', { clientY: 130 })
    pointer(handle(), 'pointerup', { clientY: 130 })
    expect(onReorder).toHaveBeenCalledExactlyOnceWith(0, 2)
    expect(state(0)).toBe('idle')
    expect(screen.getByRole('status')).toHaveTextContent('Dropped garlic at position 3 of 3.')
    expect(releasePointerCapture).toHaveBeenCalled()
  })
  it('dropping back on the starting row commits nothing', () => {
    pointer(handle(), 'pointerdown', { clientY: 25 })
    pointer(handle(), 'pointermove', { clientY: 130 })
    pointer(handle(), 'pointermove', { clientY: 20 })
    pointer(handle(), 'pointerup', { clientY: 20 })
    expect(onReorder).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Dropped garlic. Position unchanged, 1 of 3.')
  })
  it('works from the middle row too (flour to the top)', () => {
    pointer(handle('flour'), 'pointerdown', { clientY: 75 })
    pointer(handle('flour'), 'pointermove', { clientY: 10 })
    pointer(handle('flour'), 'pointerup', { clientY: 10 })
    expect(onReorder).toHaveBeenCalledExactlyOnceWith(1, 0)
  })
  it('pointer cancel (the system took the touch) restores the order and commits nothing', () => {
    pointer(handle(), 'pointerdown', { clientY: 25 })
    pointer(handle(), 'pointermove', { clientY: 130 })
    expect(shown()).toEqual(['flour', 'salt', 'garlic'])
    pointer(handle(), 'pointercancel', { clientY: 130 })
    expect(shown()).toEqual(['garlic', 'flour', 'salt'])
    expect(state(0)).toBe('idle')
    expect(onReorder).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Reordering cancelled. garlic stays at position 1 of 3.')
  })
  it('Escape during a drag cancels it, and the pointer up that follows commits nothing', () => {
    pointer(handle(), 'pointerdown', { clientY: 25 })
    pointer(handle(), 'pointermove', { clientY: 130 })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(shown()).toEqual(['garlic', 'flour', 'salt'])
    pointer(handle(), 'pointerup', { clientY: 130 })
    expect(onReorder).not.toHaveBeenCalled()
  })
  it('Escape during a pointer drag is swallowed: it neither bubbles nor keeps its default action', () => {
    const outer = vi.fn()
    window.addEventListener('keydown', outer)
    pointer(handle(), 'pointerdown', { clientY: 25 })
    pointer(handle(), 'pointermove', { clientY: 130 })
    const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    document.dispatchEvent(e)
    window.removeEventListener('keydown', outer)
    expect(e.defaultPrevented).toBe(true)
    expect(outer).not.toHaveBeenCalled()
  })
  it('a mouse move with no button down (the release happened outside the window) drops the item', () => {
    pointer(handle(), 'pointerdown', { clientY: 25 })
    pointer(handle(), 'pointermove', { clientY: 130 })
    fireEvent(document, new PointerEvent('pointermove', { bubbles: true, pointerId: 1, pointerType: 'mouse', buttons: 0, clientY: 130 }))
    expect(onReorder).toHaveBeenCalledExactlyOnceWith(0, 2)
    expect(state(0)).toBe('idle')
  })
  it('a move with the button still down keeps dragging', () => {
    pointer(handle(), 'pointerdown', { clientY: 25 })
    fireEvent(document, new PointerEvent('pointermove', { bubbles: true, pointerId: 1, pointerType: 'mouse', buttons: 1, clientY: 130 }))
    expect(state(0)).toBe('dragging')
  })
  it('the window losing focus cancels the drag', () => {
    pointer(handle(), 'pointerdown', { clientY: 25 })
    pointer(handle(), 'pointermove', { clientY: 130 })
    fireEvent.blur(window)
    expect(shown()).toEqual(['garlic', 'flour', 'salt'])
    expect(onReorder).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Reordering cancelled.')
  })
  it('lostpointercapture is ignored on purpose: a reordered node loses its capture while the drag goes on', () => {
    pointer(handle(), 'pointerdown', { clientY: 25 })
    pointer(handle(), 'pointermove', { clientY: 130 })
    fireEvent(handle(), new Event('lostpointercapture', { bubbles: true }))
    expect(state(0)).toBe('dragging')
  })
  it('keeps "Picked up" in the announcement when the first move already crosses into another row', () => {
    pointer(handle(), 'pointerdown', { clientY: 25 })
    pointer(handle(), 'pointermove', { clientY: 70 })
    const text = screen.getByRole('status').textContent ?? ''
    expect(text).toContain('Picked up garlic. Position 1 of 3.')
    expect(text).toContain('garlic moved to position 2 of 3.')
    expect(text.indexOf('Picked up')).toBeLessThan(text.indexOf('moved to'))
  })
  it('removes every document listener when the drag ends', () => {
    const remove = vi.spyOn(document, 'removeEventListener')
    pointer(handle(), 'pointerdown', { clientY: 25 })
    pointer(handle(), 'pointermove', { clientY: 130 })
    pointer(handle(), 'pointerup', { clientY: 130 })
    const types = remove.mock.calls.map((c) => c[0])
    for (const t of ['pointermove', 'pointerup', 'pointercancel', 'keydown']) expect(types).toContain(t)
  })
  it('suppresses the context menu on the handle (a touch long-press must not open the callout)', () => {
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    handle().dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
  })
})

describe('Sortable: auto-scroll near the edges', () => {
  let frames: FrameRequestCallback[]
  let scrollBy: ReturnType<typeof vi.fn>
  beforeEach(() => {
    frames = []
    scrollBy = vi.fn()
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
    vi.stubGlobal('cancelAnimationFrame', () => {})
    window.scrollBy = scrollBy as unknown as typeof window.scrollBy
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
  })
  const flush = () => frames.splice(0).forEach((cb) => cb(0))

  it('scrolls the window down while the pointer is within 48 px of the bottom, faster the closer it is', () => {
    pointer(handle(), 'pointerdown', { clientY: 25 })
    pointer(handle(), 'pointermove', { clientY: 776 })
    flush()
    expect(scrollBy).toHaveBeenLastCalledWith(0, 10)
    pointer(handle(), 'pointermove', { clientY: 800 })
    flush()
    expect(scrollBy).toHaveBeenLastCalledWith(0, 20)
  })
  it('scrolls up near the top edge', () => {
    pointer(handle(), 'pointerdown', { clientY: 100 })
    pointer(handle(), 'pointermove', { clientY: 24 })
    flush()
    expect(scrollBy).toHaveBeenLastCalledWith(0, -10)
  })
  it('does not scroll in the middle of the viewport', () => {
    pointer(handle(), 'pointerdown', { clientY: 25 })
    pointer(handle(), 'pointermove', { clientY: 400 })
    flush()
    expect(scrollBy).not.toHaveBeenCalled()
  })
  it('stops scrolling after the drop', () => {
    pointer(handle(), 'pointerdown', { clientY: 25 })
    pointer(handle(), 'pointermove', { clientY: 790 })
    pointer(handle(), 'pointerup', { clientY: 790 })
    scrollBy.mockClear()
    flush()
    expect(scrollBy).not.toHaveBeenCalled()
  })
})
