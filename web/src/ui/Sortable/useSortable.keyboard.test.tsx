// The keyboard state machine and announcements of useSortable (docs/dev/design/sort-drag.md sections 2.2 and 4).
import { act, renderHook } from '@testing-library/react'
import type { KeyboardEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useSortable } from './useSortable'

const NAMES = ['garlic', 'flour', 'salt']

function setup(over: { disabled?: boolean } = {}) {
  const onReorder = vi.fn()
  const hook = renderHook(() => useSortable({ count: 3, labelOf: (i) => NAMES[i]!, onReorder, ...over }))
  const key = (index: number, k: string) => {
    const e = { key: k, preventDefault: vi.fn(), stopPropagation: vi.fn() }
    act(() => hook.result.current.getHandleProps(index).onKeyDown(e as unknown as KeyboardEvent<HTMLButtonElement>))
    return e
  }
  return { ...hook, onReorder, key }
}

describe('useSortable: handle props', () => {
  it('names the handle, points it at the shared instructions and starts unpressed', () => {
    const { result } = setup()
    const p = result.current.getHandleProps(0)
    expect(p['aria-label']).toBe('Reorder garlic')
    expect(p['aria-describedby']).toBe(result.current.instructionsId)
    expect(result.current.instructions).toBe('Press Space to pick up, the arrow keys to move, Space to drop and Escape to cancel.')
    expect(p['aria-pressed']).toBe(false)
    expect(p.type).toBe('button')
    expect(result.current.state).toEqual({ phase: 'idle' })
    expect(result.current.order).toEqual([0, 1, 2])
    expect(result.current.announcement).toBe('')
  })
})

describe('useSortable: lifting', () => {
  it('Space lifts the item, presses its handle only and announces the keys', () => {
    const { result, key } = setup()
    const e = key(1, ' ')
    expect(e.preventDefault).toHaveBeenCalled()
    expect(result.current.state).toEqual({ phase: 'lifted', from: 1, to: 1 })
    expect(result.current.getHandleProps(1)['aria-pressed']).toBe(true)
    expect(result.current.getHandleProps(0)['aria-pressed']).toBe(false)
    expect(result.current.getItemProps(1)['data-state']).toBe('lifted')
    expect(result.current.getItemProps(0)['data-state']).toBe('idle')
    expect(result.current.announcement).toBe('Picked up flour. Position 2 of 3. Use the arrow keys to move, Space to drop, Escape to cancel.')
  })
  it('does nothing for the arrows, Enter or Escape while idle, and leaves the keys to the browser', () => {
    const { result, key } = setup()
    for (const k of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Home']) {
      const e = key(0, k)
      expect(e.preventDefault, k).not.toHaveBeenCalled()
    }
    expect(result.current.state).toEqual({ phase: 'idle' })
    expect(result.current.announcement).toBe('')
  })
  it('does nothing when disabled', () => {
    const { result, key } = setup({ disabled: true })
    key(0, ' ')
    expect(result.current.state).toEqual({ phase: 'idle' })
  })
})

describe('useSortable: moving', () => {
  it('ArrowDown and ArrowUp move the lifted item one place, preview the order and announce the position', () => {
    const { result, key, onReorder } = setup()
    key(0, ' ')
    const e = key(0, 'ArrowDown')
    expect(e.preventDefault).toHaveBeenCalled()
    expect(result.current.state).toEqual({ phase: 'lifted', from: 0, to: 1 })
    expect(result.current.order).toEqual([1, 0, 2])
    expect(result.current.announcement).toBe('garlic moved to position 2 of 3.')
    key(0, 'ArrowDown')
    expect(result.current.order).toEqual([1, 2, 0])
    key(0, 'ArrowUp')
    expect(result.current.order).toEqual([1, 0, 2])
    expect(result.current.announcement).toBe('garlic moved to position 2 of 3.')
    expect(onReorder).not.toHaveBeenCalled() // only the drop commits
  })
  it('Home and End jump to the ends', () => {
    const { result, key } = setup()
    key(1, ' ')
    key(1, 'End')
    expect(result.current.order).toEqual([0, 2, 1])
    expect(result.current.announcement).toBe('flour moved to position 3 of 3.')
    key(1, 'Home')
    expect(result.current.order).toEqual([1, 0, 2])
    expect(result.current.announcement).toBe('flour moved to position 1 of 3.')
  })
  it('says so at an edge and stays put', () => {
    const { result, key } = setup()
    key(0, ' ')
    key(0, 'ArrowUp')
    expect(result.current.announcement).toBe('garlic is already first.')
    expect(result.current.state).toEqual({ phase: 'lifted', from: 0, to: 0 })
    key(0, 'End')
    key(0, 'ArrowDown')
    expect(result.current.announcement).toBe('garlic is already last.')
    expect(result.current.state).toEqual({ phase: 'lifted', from: 0, to: 2 })
  })
  it('ignores other keys while lifted but keeps the item lifted', () => {
    const { result, key } = setup()
    key(0, ' ')
    key(0, 'a')
    key(0, 'ArrowLeft')
    expect(result.current.state).toEqual({ phase: 'lifted', from: 0, to: 0 })
  })
})

describe('useSortable: dropping and cancelling', () => {
  it('Space drops: onReorder(from, to) once, idle again, announced', () => {
    const { result, key, onReorder } = setup()
    key(0, ' ')
    key(0, 'ArrowDown')
    key(0, 'ArrowDown')
    key(0, ' ')
    expect(onReorder).toHaveBeenCalledTimes(1)
    expect(onReorder).toHaveBeenCalledWith(0, 2)
    expect(result.current.state).toEqual({ phase: 'idle' })
    expect(result.current.order).toEqual([0, 1, 2]) // the parent owns the new order
    expect(result.current.announcement).toBe('Dropped garlic at position 3 of 3.')
  })
  it('dropping where it started calls nothing and says the position is unchanged', () => {
    const { result, key, onReorder } = setup()
    key(0, ' ')
    key(0, 'ArrowDown')
    key(0, 'ArrowUp')
    key(0, ' ')
    expect(onReorder).not.toHaveBeenCalled()
    expect(result.current.announcement).toBe('Dropped garlic. Position unchanged, 1 of 3.')
  })
  it('Escape cancels: nothing is called, the order is restored and the cancel is announced; it does not close a dialog around it', () => {
    const { result, key, onReorder } = setup()
    key(0, ' ')
    key(0, 'ArrowDown')
    const e = key(0, 'Escape')
    expect(e.stopPropagation).toHaveBeenCalled()
    expect(onReorder).not.toHaveBeenCalled()
    expect(result.current.state).toEqual({ phase: 'idle' })
    expect(result.current.order).toEqual([0, 1, 2])
    expect(result.current.announcement).toBe('Reordering cancelled. garlic stays at position 1 of 3.')
  })
  it('losing focus cancels as well', () => {
    const { result, key, onReorder } = setup()
    key(0, ' ')
    key(0, 'ArrowDown')
    act(() => result.current.getHandleProps(0).onBlur())
    expect(onReorder).not.toHaveBeenCalled()
    expect(result.current.state).toEqual({ phase: 'idle' })
    expect(result.current.announcement).toBe('Reordering cancelled. garlic stays at position 1 of 3.')
  })
  it('can lift again after a drop or a cancel', () => {
    const { result, key } = setup()
    key(2, ' ')
    key(2, 'Escape')
    key(2, ' ')
    expect(result.current.state).toEqual({ phase: 'lifted', from: 2, to: 2 })
  })
})
