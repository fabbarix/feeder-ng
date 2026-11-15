import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recordServerContact, resetServerContact } from '../lib/serverContact'
import { useConnectivity } from './useConnectivity'

// B9-49 (RES-07): `lastContact` replaces `savedAt`. It is the newest successful server answer (lib/serverContact, recorded by the HTTP
// client), not the moment the connection dropped, and it is known while online too (the banner shows it only while offline).
beforeEach(() => {
  localStorage.clear()
  resetServerContact()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const setOnline = (value: boolean) => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value)

describe('useConnectivity', () => {
  it('is online, with no contact yet, when the browser is online and nothing has answered', () => {
    setOnline(true)
    const { result } = renderHook(() => useConnectivity())
    expect(result.current).toEqual({ offline: false, lastContact: null })
  })

  it('lastContact is the newest successful server answer, and follows new answers while mounted', () => {
    setOnline(true)
    recordServerContact(new Date(2026, 10, 10, 9, 30))
    const { result } = renderHook(() => useConnectivity())
    expect(result.current.lastContact).toEqual(new Date(2026, 10, 10, 9, 30))
    act(() => recordServerContact(new Date(2026, 10, 10, 9, 40)))
    expect(result.current.lastContact).toEqual(new Date(2026, 10, 10, 9, 40))
  })

  it('going offline does not replace it with the moment the connection dropped (the old savedAt)', () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 10, 9, 45) })
    setOnline(true)
    recordServerContact(new Date(2026, 10, 10, 9, 30))
    const { result } = renderHook(() => useConnectivity())
    act(() => {
      setOnline(false)
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current.offline).toBe(true)
    expect(result.current.lastContact).toEqual(new Date(2026, 10, 10, 9, 30))
  })

  it('starts offline with the contact kept on the device from the last session', () => {
    recordServerContact(new Date(2026, 10, 9, 18, 5))
    resetServerContact({ keepStored: true }) // a fresh start of the app
    setOnline(false)
    const { result } = renderHook(() => useConnectivity())
    expect(result.current).toEqual({ offline: true, lastContact: new Date(2026, 10, 9, 18, 5) })
  })

  it('offline with nothing ever answered: lastContact is null (the banner then says only "showing what was saved")', () => {
    setOnline(false)
    const { result } = renderHook(() => useConnectivity())
    expect(result.current).toEqual({ offline: true, lastContact: null })
  })

  it('comes back online on the online event', () => {
    setOnline(false)
    const { result } = renderHook(() => useConnectivity())
    act(() => {
      setOnline(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(result.current.offline).toBe(false)
  })

  it('removes its listeners and its subscription on unmount', () => {
    setOnline(true)
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useConnectivity())
    unmount()
    expect(remove.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(['online', 'offline']))
    expect(() => act(() => recordServerContact(new Date()))).not.toThrow()
  })
})
