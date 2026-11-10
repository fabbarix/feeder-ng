import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi, type Mock } from 'vitest'
import type { CropAspect } from '../lib/crop'
import { useCropper, type KeyLike } from './useCropper'

function setup(o: { width?: number; height?: number; aspect?: CropAspect; viewWidth?: number } = {}) {
  const props = { width: 800, height: 600, aspect: 'free' as CropAspect, viewWidth: 400, ...o }
  return renderHook((p: typeof props) => useCropper(p), { initialProps: props })
}
const ptr = (clientX: number, clientY: number, pointerId = 1) => ({ clientX, clientY, pointerId })
const key = (k: string, shiftKey = false) => ({ key: k, shiftKey, preventDefault: vi.fn() }) as KeyLike & { preventDefault: Mock<() => void> }

describe('useCropper: start', () => {
  it('free: the whole picture, no turn, nothing changed, eight handles', () => {
    const { result } = setup()
    expect(result.current.rect).toEqual({ x: 0, y: 0, width: 800, height: 600 })
    expect(result.current.turns).toBe(0)
    expect(result.current.bounds).toEqual({ width: 800, height: 600 })
    expect(result.current.changed).toBe(false)
    expect(result.current.handles).toHaveLength(8)
    expect(result.current.percent).toEqual({ left: 0, top: 0, width: 100, height: 100 })
    expect(result.current.dragging).toBe(false)
  })

  it('locked: the largest centred rect of that aspect, four handles', () => {
    const { result } = setup({ aspect: 1 })
    expect(result.current.rect).toEqual({ x: 100, y: 0, width: 600, height: 600 })
    expect(result.current.handles).toEqual(['nw', 'ne', 'se', 'sw'])
    expect(result.current.percent).toEqual({ left: 12.5, top: 0, width: 75, height: 100 })
  })

  it('a locked crop that is smaller than the picture counts as a change (the picture will be cropped)', () => {
    expect(setup({ aspect: 1 }).result.current.changed).toBe(true)
    expect(setup({ aspect: 4 / 3 }).result.current.changed).toBe(false) // 800x600 is already 4:3
  })

  it('starts again when the picture or the aspect changes', () => {
    const { result, rerender } = setup()
    rerender({ width: 600, height: 600, aspect: 1, viewWidth: 400 })
    expect(result.current.rect).toEqual({ x: 0, y: 0, width: 600, height: 600 })
  })
})

describe('useCropper: pointer', () => {
  it('moves the box by the drag distance scaled to picture pixels (800 px shown at 400 px: x2)', () => {
    const { result } = setup({ aspect: 1 }) // 600x600 at x=100
    act(() => result.current.begin('move', ptr(100, 100)))
    expect(result.current.dragging).toBe(true)
    act(() => result.current.drag(ptr(120, 100)))
    expect(result.current.rect).toEqual({ x: 140, y: 0, width: 600, height: 600 })
    act(() => result.current.drag(ptr(110, 100)))
    expect(result.current.rect.x).toBe(120) // measured from where the drag began, not cumulative
    act(() => result.current.end(ptr(110, 100)))
    expect(result.current.dragging).toBe(false)
  })

  it('resizes a free corner', () => {
    const { result } = setup()
    act(() => result.current.begin('se', ptr(400, 300)))
    act(() => result.current.drag(ptr(350, 300)))
    expect(result.current.rect).toEqual({ x: 0, y: 0, width: 700, height: 600 })
    expect(result.current.changed).toBe(true)
  })

  it('resizes a locked corner and keeps the aspect', () => {
    const { result } = setup({ width: 1000, height: 1000, aspect: 4 / 3, viewWidth: 500 }) // 1000x750 at y=125
    act(() => result.current.begin('se', ptr(500, 400)))
    act(() => result.current.drag(ptr(450, 400)))
    expect(result.current.rect).toEqual({ x: 0, y: 125, width: 900, height: 675 })
  })

  it('ignores moves without a drag, a second pointer, and moves after the end', () => {
    const { result } = setup({ aspect: 1 })
    act(() => result.current.drag(ptr(300, 300)))
    expect(result.current.rect.x).toBe(100)
    act(() => result.current.begin('move', ptr(100, 100, 1)))
    act(() => result.current.drag(ptr(150, 100, 2)))
    expect(result.current.rect.x).toBe(100)
    act(() => result.current.end(ptr(100, 100, 1)))
    act(() => result.current.drag(ptr(150, 100, 1)))
    expect(result.current.rect.x).toBe(100)
  })

  it('does nothing (and never produces NaN) before the picture is measured', () => {
    const { result } = setup({ aspect: 1, viewWidth: 0 })
    act(() => result.current.begin('move', ptr(100, 100)))
    act(() => result.current.drag(ptr(150, 100)))
    expect(result.current.rect).toEqual({ x: 100, y: 0, width: 600, height: 600 })
  })
})

describe('useCropper: keyboard', () => {
  it('the step is 1% of the long side (Shift: 10x); a corner handle moves its corner', () => {
    const { result } = setup({ width: 1000, height: 500 })
    const left = key('ArrowLeft')
    let handled = false
    act(() => {
      handled = result.current.key('se', left)
    })
    expect(handled).toBe(true)
    expect(left.preventDefault).toHaveBeenCalled()
    expect(result.current.rect).toEqual({ x: 0, y: 0, width: 990, height: 500 })
    act(() => void result.current.key('se', key('ArrowUp', true)))
    expect(result.current.rect).toEqual({ x: 0, y: 0, width: 990, height: 400 })
    act(() => void result.current.key('nw', key('ArrowRight')))
    expect(result.current.rect).toEqual({ x: 10, y: 0, width: 980, height: 400 })
  })

  it('an edge handle moves only its edge', () => {
    const { result } = setup({ width: 1000, height: 500 })
    act(() => void result.current.key('s', key('ArrowUp')))
    expect(result.current.rect).toEqual({ x: 0, y: 0, width: 1000, height: 490 })
    act(() => void result.current.key('s', key('ArrowLeft')))
    expect(result.current.rect).toEqual({ x: 0, y: 0, width: 1000, height: 490 })
  })

  it('the box handle moves the whole box and stops at the edges', () => {
    const { result } = setup({ width: 1000, height: 1000, aspect: 4 / 3 }) // 1000x750 at y=125
    act(() => void result.current.key('move', key('ArrowUp')))
    expect(result.current.rect.y).toBe(115)
    act(() => void result.current.key('move', key('ArrowUp', true)))
    expect(result.current.rect.y).toBe(15)
    act(() => void result.current.key('move', key('ArrowUp', true)))
    expect(result.current.rect.y).toBe(0)
    act(() => void result.current.key('move', key('ArrowRight')))
    expect(result.current.rect.x).toBe(0) // already as far right as it goes
  })

  it('a locked corner keeps the aspect with the keyboard too', () => {
    const { result } = setup({ width: 1000, height: 1000, aspect: 1 })
    act(() => void result.current.key('se', key('ArrowLeft')))
    expect(result.current.rect).toEqual({ x: 0, y: 0, width: 990, height: 990 })
  })

  it('other keys are not handled and keep their default (Tab must keep working)', () => {
    const { result } = setup()
    const tab = key('Tab')
    let handled = true
    act(() => {
      handled = result.current.key('se', tab)
    })
    expect(handled).toBe(false)
    expect(tab.preventDefault).not.toHaveBeenCalled()
  })
})

describe('useCropper: rotate, reset, output', () => {
  it('rotating turns the picture and the free crop with it, and back again', () => {
    const { result } = setup({ width: 400, height: 300 })
    act(() => void result.current.key('se', key('ArrowLeft'))) // step 4 -> 396x300
    expect(result.current.rect).toEqual({ x: 0, y: 0, width: 396, height: 300 })
    act(() => result.current.rotate(1))
    expect(result.current.turns).toBe(1)
    expect(result.current.bounds).toEqual({ width: 300, height: 400 })
    expect(result.current.rect).toEqual({ x: 0, y: 0, width: 300, height: 396 })
    act(() => result.current.rotate(-1))
    expect(result.current.turns).toBe(0)
    expect(result.current.rect).toEqual({ x: 0, y: 0, width: 396, height: 300 })
  })

  it('four turns are no turn; counter-clockwise from 0 is 3', () => {
    const { result } = setup()
    for (let i = 0; i < 4; i++) act(() => result.current.rotate(1))
    expect(result.current.turns).toBe(0)
    act(() => result.current.rotate(-1))
    expect(result.current.turns).toBe(3)
    expect(result.current.changed).toBe(true)
  })

  it('a locked crop starts again for the turned picture', () => {
    const { result } = setup({ aspect: 1 })
    act(() => result.current.rotate(1))
    expect(result.current.bounds).toEqual({ width: 600, height: 800 })
    expect(result.current.rect).toEqual({ x: 0, y: 100, width: 600, height: 600 })
  })

  it('reset: no turn, the first crop, unchanged', () => {
    const { result } = setup()
    act(() => void result.current.key('se', key('ArrowLeft', true)))
    act(() => result.current.rotate(1))
    act(() => result.current.reset())
    expect(result.current.turns).toBe(0)
    expect(result.current.rect).toEqual({ x: 0, y: 0, width: 800, height: 600 })
    expect(result.current.changed).toBe(false)
  })

  it('output: the turns, the crop in turned pixels, and the size scaled to the long edge', () => {
    const { result } = setup({ width: 4000, height: 3000, viewWidth: 400 })
    act(() => void result.current.key('se', key('ArrowLeft', true))) // step 40 x10 = 400 -> 3600x3000
    expect(result.current.output(2576)).toEqual({ turns: 0, crop: { x: 0, y: 0, width: 3600, height: 3000 }, width: 2576, height: 2147 })
    expect(result.current.output(5000)).toMatchObject({ width: 3600, height: 3000 })
  })
})
