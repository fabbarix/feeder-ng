import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useScreenState } from './useScreenState'

// B9-20 (RES-02): the React-facing wrapper of screenState: it reads the connection from useConnectivity.
const conn = vi.hoisted(() => ({ offline: false }))
vi.mock('./useConnectivity', () => ({ useConnectivity: () => ({ offline: conn.offline, savedAt: null }) }))
afterEach(() => {
  conn.offline = false
})

describe('useScreenState', () => {
  it('online with no data and a failure is failed', () => {
    expect(renderHook(() => useScreenState({ data: undefined, isError: true, fetchStatus: 'idle' }, { isEmpty: false, hasFilter: false })).result.current).toBe('failed')
  })
  it('offline with no data is offlineUnknown', () => {
    conn.offline = true
    expect(renderHook(() => useScreenState({ data: undefined, isError: false, fetchStatus: 'paused' }, { isEmpty: false, hasFilter: false })).result.current).toBe('offlineUnknown')
  })
  it('offline with data is offlineSaved; an empty answer under a filter is filteredEmpty', () => {
    conn.offline = true
    expect(renderHook(() => useScreenState({ data: [1], isError: false, fetchStatus: 'idle' }, { isEmpty: false, hasFilter: false })).result.current).toBe('offlineSaved')
    conn.offline = false
    expect(renderHook(() => useScreenState({ data: [], isError: false, fetchStatus: 'idle' }, { isEmpty: true, hasFilter: true })).result.current).toBe('filteredEmpty')
  })
})
