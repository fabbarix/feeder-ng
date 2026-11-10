import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createScanSessionStore, scanSession, useScanSession, useScanSessionActive } from './useScanSessionActive'

describe('createScanSessionStore', () => {
  it('is inactive until a session starts and again after it ends', () => {
    const s = createScanSessionStore()
    expect(s.isActive()).toBe(false)
    const end = s.start()
    expect(s.isActive()).toBe(true)
    end()
    expect(s.isActive()).toBe(false)
  })

  it('counts overlapping sessions and ignores a second end', () => {
    const s = createScanSessionStore()
    const a = s.start()
    const b = s.start()
    a()
    a()
    expect(s.isActive()).toBe(true)
    b()
    expect(s.isActive()).toBe(false)
  })

  it('notifies subscribers on every change, until they unsubscribe', () => {
    const s = createScanSessionStore()
    const listener = vi.fn()
    const off = s.subscribe(listener)
    const end = s.start()
    end()
    expect(listener).toHaveBeenCalledTimes(2)
    off()
    s.start()
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

describe('useScanSession / useScanSessionActive', () => {
  it('reads true while a Scan screen in Shop mode is mounted', () => {
    const reader = renderHook(() => useScanSessionActive())
    expect(reader.result.current).toBe(false)
    const screen = renderHook(({ active }) => useScanSession(active), { initialProps: { active: true } })
    expect(reader.result.current).toBe(true)
    act(() => screen.rerender({ active: false }))
    expect(reader.result.current).toBe(false)
    act(() => screen.rerender({ active: true }))
    expect(reader.result.current).toBe(true)
    screen.unmount()
    expect(reader.result.current).toBe(false)
    expect(scanSession.isActive()).toBe(false)
  })
})
