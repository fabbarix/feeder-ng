import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi, type Mock } from 'vitest'
import type { CropAspect } from '../lib/crop'
import type { ImageEdit } from '../lib/edit'
import { useImageEditor, type KeyLike } from './useImageEditor'

const edit = (x: number, y: number, width: number, height: number, turns: ImageEdit['turns'] = 0): ImageEdit => ({ turns, crop: { x, y, width, height } })

function setup(o: { value?: ImageEdit; width?: number; height?: number; aspect?: CropAspect; viewWidth?: number; minSide?: number } = {}) {
  const onChange = vi.fn()
  const props = { value: edit(0, 0, 800, 600), width: 800, height: 600, aspect: 'free' as CropAspect, viewWidth: 400, onChange, ...o }
  const hook = renderHook((p: typeof props) => useImageEditor(p), { initialProps: props })
  return { ...hook, onChange, props }
}
const ptr = (clientX: number, clientY: number, pointerId = 1) => ({ clientX, clientY, pointerId })
const key = (k: string, shiftKey = false) => ({ key: k, shiftKey, preventDefault: vi.fn() }) as KeyLike & { preventDefault: Mock<() => void> }

describe('useImageEditor: derived from the controlled value', () => {
  it('free, whole picture: bounds, percent, eight handles, nothing changed', () => {
    const { result } = setup()
    expect(result.current.bounds).toEqual({ width: 800, height: 600 })
    expect(result.current.percent).toEqual({ left: 0, top: 0, width: 100, height: 100 })
    expect(result.current.handles).toHaveLength(8)
    expect(result.current.changed).toBe(false)
    expect(result.current.dragging).toBe(false)
    expect(result.current.readout).toBe('Crop area: 800 by 600 pixels')
  })

  it('shows the value it is given, turned: the bounds swap and the percent follows the crop', () => {
    const { result } = setup({ value: edit(150, 200, 300, 400, 1) })
    expect(result.current.bounds).toEqual({ width: 600, height: 800 })
    expect(result.current.percent).toEqual({ left: 25, top: 25, width: 50, height: 50 })
    expect(result.current.changed).toBe(true)
    expect(result.current.readout).toBe('Crop area: 300 by 400 pixels')
  })

  it('locked: four handles', () => {
    expect(setup({ aspect: 1, value: edit(100, 0, 600, 600) }).result.current.handles).toEqual(['nw', 'ne', 'se', 'sw'])
  })

  it('changed: a smaller crop, or a turn with the whole turned picture', () => {
    expect(setup({ value: edit(0, 0, 700, 600) }).result.current.changed).toBe(true)
    expect(setup({ value: edit(0, 0, 600, 800, 1) }).result.current.changed).toBe(true)
  })

  it('has no state of its own: a new value is shown at once', () => {
    const { result, rerender, props } = setup()
    rerender({ ...props, value: edit(0, 0, 400, 300) })
    expect(result.current.percent.width).toBe(50)
  })
})

describe('useImageEditor: rotate and reset call onChange', () => {
  it('rotate(1) reports the turned edit', () => {
    const { result, onChange } = setup({ value: edit(100, 50, 300, 200) })
    act(() => result.current.rotate(1))
    expect(onChange).toHaveBeenCalledWith(edit(350, 100, 200, 300, 1))
  })

  it('rotate(-1) reports a counter-clockwise turn', () => {
    const { result, onChange } = setup()
    act(() => result.current.rotate(-1))
    expect(onChange).toHaveBeenCalledWith(edit(0, 0, 600, 800, 3))
  })

  it('the read-out says "Turned right. " after a right turn and "Turned left. " after a left turn', () => {
    const { result, rerender, props } = setup()
    act(() => result.current.rotate(1))
    rerender({ ...props, value: edit(0, 0, 600, 800, 1) })
    expect(result.current.readout).toBe('Turned right. Crop area: 600 by 800 pixels')
    act(() => result.current.rotate(-1))
    rerender({ ...props, value: edit(0, 0, 800, 600, 0) })
    expect(result.current.readout).toBe('Turned left. Crop area: 800 by 600 pixels')
  })

  it('the turned note goes away at the next crop change', () => {
    const { result, rerender, props } = setup()
    act(() => result.current.rotate(1))
    rerender({ ...props, value: edit(0, 0, 600, 800, 1) })
    act(() => void result.current.key('move', key('ArrowLeft')))
    rerender({ ...props, value: edit(0, 0, 500, 800, 1) })
    expect(result.current.readout).toBe('Crop area: 500 by 800 pixels')
  })

  it('reset reports no turn and the initial crop', () => {
    const { result, onChange } = setup({ value: edit(10, 10, 300, 200, 2) })
    act(() => result.current.reset())
    expect(onChange).toHaveBeenCalledWith(edit(0, 0, 800, 600, 0))
  })

  it('reset on a locked aspect reports the centred crop', () => {
    const { result, onChange } = setup({ aspect: 1, value: edit(0, 0, 100, 100, 1) })
    act(() => result.current.reset())
    expect(onChange).toHaveBeenCalledWith(edit(100, 0, 600, 600, 0))
  })
})

describe('useImageEditor: pointer', () => {
  it('a move drag reports the start rect moved by the delta scaled to picture pixels (800 shown at 400 px: x2)', () => {
    const { result, onChange } = setup({ value: edit(100, 100, 400, 300) })
    act(() => result.current.begin('move', ptr(100, 100)))
    expect(result.current.dragging).toBe(true)
    act(() => result.current.drag(ptr(120, 110)))
    expect(onChange).toHaveBeenLastCalledWith(edit(140, 120, 400, 300))
    act(() => result.current.drag(ptr(110, 100)))
    expect(onChange).toHaveBeenLastCalledWith(edit(120, 100, 400, 300)) // from where the drag began, not cumulative
    act(() => result.current.end(ptr(110, 100)))
    expect(result.current.dragging).toBe(false)
  })

  it('measures from the value at the drag start even when the host has already applied the earlier changes', () => {
    const { result, rerender, props, onChange } = setup({ value: edit(100, 100, 400, 300) })
    act(() => result.current.begin('move', ptr(0, 0)))
    act(() => result.current.drag(ptr(20, 0)))
    rerender({ ...props, value: edit(140, 100, 400, 300) })
    act(() => result.current.drag(ptr(30, 0)))
    expect(onChange).toHaveBeenLastCalledWith(edit(160, 100, 400, 300))
  })

  it('resizes a free corner', () => {
    const { result, onChange } = setup()
    act(() => result.current.begin('se', ptr(400, 300)))
    act(() => result.current.drag(ptr(350, 300)))
    expect(onChange).toHaveBeenLastCalledWith(edit(0, 0, 700, 600))
  })

  it('respects minSide', () => {
    const { result, onChange } = setup({ minSide: 160 })
    act(() => result.current.begin('e', ptr(400, 150)))
    act(() => result.current.drag(ptr(-1000, 150)))
    expect(onChange).toHaveBeenLastCalledWith(edit(0, 0, 160, 600))
  })

  it('ignores moves without a drag, from a second pointer, and after the end', () => {
    const { result, onChange } = setup({ value: edit(100, 100, 400, 300) })
    act(() => result.current.drag(ptr(300, 300)))
    act(() => result.current.begin('move', ptr(100, 100, 1)))
    act(() => result.current.drag(ptr(150, 100, 2)))
    act(() => result.current.end(ptr(100, 100, 1)))
    act(() => result.current.drag(ptr(150, 100, 1)))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does nothing before the picture is measured (viewWidth 0)', () => {
    const { result, onChange } = setup({ viewWidth: 0, value: edit(100, 100, 400, 300) })
    act(() => result.current.begin('move', ptr(100, 100)))
    expect(result.current.dragging).toBe(false)
    act(() => result.current.drag(ptr(150, 100)))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('useImageEditor: keyboard', () => {
  it('arrow keys report a nudged edit and preventDefault; Shift is x10', () => {
    const { result, onChange } = setup({ value: edit(100, 100, 400, 300) })
    const right = key('ArrowRight')
    let handled = false
    act(() => {
      handled = result.current.key('move', right)
    })
    expect(handled).toBe(true)
    expect(right.preventDefault).toHaveBeenCalled()
    expect(onChange).toHaveBeenLastCalledWith(edit(108, 100, 400, 300))
    act(() => void result.current.key('move', key('ArrowRight', true)))
    expect(onChange).toHaveBeenLastCalledWith(edit(180, 100, 400, 300))
  })

  it('a handle moves its own side', () => {
    const { result, onChange } = setup()
    act(() => void result.current.key('s', key('ArrowUp')))
    expect(onChange).toHaveBeenLastCalledWith(edit(0, 0, 800, 592))
  })

  it('other keys are not handled, keep their default and report nothing', () => {
    const { result, onChange } = setup()
    const tab = key('Tab')
    let handled = true
    act(() => {
      handled = result.current.key('se', tab)
    })
    expect(handled).toBe(false)
    expect(tab.preventDefault).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })
})
