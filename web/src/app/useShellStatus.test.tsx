// B9-49 (RES-07): the shell's one place that sums the features' useShellStatus hooks (AppRoot, AppUpdate and the back-online notice all
// read it). Each hook may report waiting Scans, waiting Ticks (RES-03) and Sign-in requests. The hook list is fixed for the app's life.
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ShellStatusHook } from './features'
import { useShellStatus } from './useShellStatus'

describe('useShellStatus(hooks)', () => {
  it('is all zeros with no hooks', () => {
    const { result } = renderHook(() => useShellStatus([]))
    expect(result.current).toEqual({ pendingScans: 0, pendingTicks: 0, pendingAccessRequests: 0 })
  })

  it('sums each count over the features and ignores what a feature leaves out', () => {
    const hooks: ShellStatusHook[] = [() => ({ pendingScans: 2 }), () => ({ pendingScans: 3, pendingTicks: 1, pendingAccessRequests: 9 }), () => ({}), () => ({ pendingTicks: 4 })]
    const { result } = renderHook(() => useShellStatus(hooks))
    expect(result.current).toEqual({ pendingScans: 5, pendingTicks: 5, pendingAccessRequests: 9 })
  })

  it('calls every hook on every render, in order (they are hooks)', () => {
    const calls: string[] = []
    const hooks: ShellStatusHook[] = [() => (calls.push('a'), {}), () => (calls.push('b'), {})]
    const { rerender } = renderHook(() => useShellStatus(hooks))
    rerender()
    expect(calls).toEqual(['a', 'b', 'a', 'b'])
  })

  it('syncCount is Scans plus Ticks: what the update prompt waits for (an access request is not a sync)', () => {
    const hooks: ShellStatusHook[] = [() => ({ pendingScans: 2, pendingTicks: 1, pendingAccessRequests: 7 })]
    const { result } = renderHook(() => useShellStatus(hooks))
    expect(result.current.syncCount).toBe(3)
  })
})
