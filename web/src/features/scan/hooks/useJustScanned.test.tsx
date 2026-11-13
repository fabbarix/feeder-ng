// SR4 review: the "just scanned" wash marks the row a new scan put on top, and never a row that came back with the session.
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useJustScanned } from './useJustScanned'

const hook = (count: number | null, top: string | null) =>
  renderHook(({ count, top }: { count: number | null; top: string | null }) => useJustScanned(count, top), { initialProps: { count, top } })

describe('useJustScanned', () => {
  it('marks nothing at first, nor when the stored session loads', () => {
    const { result, rerender } = hook(null, null)
    expect(result.current).toBeNull()
    rerender({ count: 3, top: '7' })
    expect(result.current).toBeNull()
  })

  it('marks the top row when a scan grows the session, and alternates the pulse so a rescan plays again', () => {
    const { result, rerender } = hook(2, '7')
    rerender({ count: 3, top: '31' })
    expect(result.current).toEqual({ key: '31', pulse: 'a' })
    rerender({ count: 4, top: '31' })
    expect(result.current).toEqual({ key: '31', pulse: 'b' })
  })

  it('an Undo or a Remove (fewer scans) washes nothing new', () => {
    const { result, rerender } = hook(2, '7')
    rerender({ count: 1, top: '31' })
    expect(result.current).toBeNull()
  })
})
