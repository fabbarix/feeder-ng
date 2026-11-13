// DS-SHOP: the row sheet's state and wiring live in a hook. Tapping a row opens its sheet; an action calls its handler, then closes.
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { lineEntry } from '../lib/lines'
import { makeExtra, makeLine, makePast } from '../testData'
import { extraEntry } from '../lib/lines'
import { useLineSheet } from './useLineSheet'

const plain = lineEntry(makeLine(), 'USD', 'metric')
const hinted = lineEntry(makeLine({ pastPlannedMeals: [makePast()] }), 'USD', 'metric')
const extra = extraEntry(makeExtra(), 'metric')

function setup() {
  const h = { onNotNeeded: vi.fn(), onNeededAfterAll: vi.fn(), onMarkIt: vi.fn(), onDelete: vi.fn() }
  const view = renderHook(() => useLineSheet(h))
  return { h, view }
}

describe('useLineSheet', () => {
  it('starts closed', () => {
    const { view } = setup()
    expect(view.result.current.entry).toBeNull()
    expect(view.result.current.actions).toEqual([])
  })

  it('open(entry, group) shows that entry with the actions its group offers; close() hides it', () => {
    const { view } = setup()
    act(() => view.result.current.open(hinted, 'open'))
    expect(view.result.current.entry).toBe(hinted)
    expect(view.result.current.group).toBe('open')
    expect(view.result.current.actions).toEqual(['mark-it', 'not-needed'])
    act(() => view.result.current.close())
    expect(view.result.current.entry).toBeNull()
  })

  it.each([
    ['not-needed', 'onNotNeeded', plain, 'open'],
    ['mark-it', 'onMarkIt', hinted, 'open'],
    ['delete', 'onDelete', extra, 'open'],
    ['needed-after-all', 'onNeededAfterAll', plain, 'not-needed'],
  ] as const)('run("%s") calls %s with the entry and closes the sheet', (id, handler, entry, group) => {
    const { h, view } = setup()
    act(() => view.result.current.open(entry, group))
    act(() => view.result.current.run(id))
    expect(h[handler]).toHaveBeenCalledExactlyOnceWith(entry)
    expect(view.result.current.entry).toBeNull()
  })

  it('run() ignores an action the sheet does not offer (a stale button cannot Delete a Line)', () => {
    const { h, view } = setup()
    act(() => view.result.current.open(plain, 'open'))
    act(() => view.result.current.run('delete'))
    expect(h.onDelete).not.toHaveBeenCalled()
    expect(view.result.current.entry).toBe(plain)
  })

  it('run() with nothing open does nothing', () => {
    const { h, view } = setup()
    act(() => view.result.current.run('not-needed'))
    expect(h.onNotNeeded).not.toHaveBeenCalled()
  })
})
