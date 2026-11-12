// CRS G2 (rx-pt.md section 4.2): which explanation Tiles show their full list; the URL hash opens the one holding its cell.
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ALEX, SAM, exclusionCell, sideWeek } from '../couldnt-fixtures'
import { explanationGroups } from '../lib/couldntExclusions'
import { useExplanationExpansion } from './useExplanationExpansion'

const slots = sideWeek(['2026-11-13', '2026-11-14', '2026-11-15'])
const groups = explanationGroups(
  [exclusionCell('2026-11-13'), exclusionCell('2026-11-14', { attendance: [SAM], optOuts: [ALEX] }), exclusionCell('2026-11-15')],
  slots,
)

describe('useExplanationExpansion', () => {
  it('starts collapsed, with no target', () => {
    const { result } = renderHook(() => useExplanationExpansion(groups, ''))
    expect(groups).toHaveLength(2)
    expect(groups.every((g) => !result.current.isOpen(g.key))).toBe(true)
    expect(result.current.targetId).toBeNull()
  })

  it('toggles one Tile at a time', () => {
    const { result } = renderHook(() => useExplanationExpansion(groups, ''))
    act(() => result.current.toggle(groups[0]!.key))
    expect(result.current.isOpen(groups[0]!.key)).toBe(true)
    expect(result.current.isOpen(groups[1]!.key)).toBe(false)
    act(() => result.current.toggle(groups[0]!.key))
    expect(result.current.isOpen(groups[0]!.key)).toBe(false)
  })

  it('a hash naming a cell opens the Tile that holds it and names it as the target', () => {
    const { result } = renderHook(() => useExplanationExpansion(groups, '#cell-2026-11-14-4-2'))
    expect(result.current.isOpen(groups[1]!.key)).toBe(true)
    expect(result.current.isOpen(groups[0]!.key)).toBe(false)
    expect(result.current.targetId).toBe('cell-2026-11-14-4-2')
  })

  it('a cell of the first Tile that is not its first one opens that Tile too', () => {
    const { result } = renderHook(() => useExplanationExpansion(groups, '#cell-2026-11-15-4-2'))
    expect(result.current.isOpen(groups[0]!.key)).toBe(true)
    expect(result.current.targetId).toBe('cell-2026-11-15-4-2')
  })

  it('a hash that names no cell (or none we have) opens nothing', () => {
    const { result } = renderHook(() => useExplanationExpansion(groups, '#cell-2026-12-01-4-2'))
    expect(groups.every((g) => !result.current.isOpen(g.key))).toBe(true)
    expect(result.current.targetId).toBeNull()
    const other = renderHook(() => useExplanationExpansion(groups, '#something-else')).result.current
    expect(other.targetId).toBeNull()
  })

  it('opens the target once the groups arrive after the hash (the page loads first)', () => {
    const { result, rerender } = renderHook(({ g }) => useExplanationExpansion(g, '#cell-2026-11-14-4-2'), { initialProps: { g: [] as typeof groups } })
    expect(result.current.targetId).toBeNull()
    rerender({ g: groups })
    expect(result.current.isOpen(groups[1]!.key)).toBe(true)
    expect(result.current.targetId).toBe('cell-2026-11-14-4-2')
  })
})
