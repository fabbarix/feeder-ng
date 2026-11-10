import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeAlarm, FakeSpeech, FakeWakeLock } from '../adapters/fakes'
import type { CookTimer } from '../types'
import { useTimerAlarm, useVoiceCommands, useVoicePreference, useWakeLock } from './useDevice'

describe('useWakeLock', () => {
  it('acquires on mount and releases on unmount', async () => {
    const lock = new FakeWakeLock()
    const { unmount } = renderHook(() => useWakeLock(lock))
    await act(async () => {})
    expect(lock.held).toBe(true)
    unmount()
    expect(lock.releaseCalls).toBe(1)
    expect(lock.held).toBe(false)
  })

  it('acquires again when the page becomes visible after the system dropped the lock', async () => {
    const lock = new FakeWakeLock()
    renderHook(() => useWakeLock(lock))
    await act(async () => {})
    lock.systemRelease()
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(lock.held).toBe(true)
    expect(lock.acquireCalls).toBe(2)
  })

  it('does nothing while inactive, and reports support', async () => {
    const lock = new FakeWakeLock(false)
    const { result } = renderHook(() => useWakeLock(lock, false))
    await act(async () => {})
    expect(lock.acquireCalls).toBe(0)
    expect(result.current.supported).toBe(false)
  })
})

describe('useVoiceCommands', () => {
  it('listens only while enabled and forwards recognised commands', () => {
    const speech = new FakeSpeech()
    const onCommand = vi.fn()
    const { rerender } = renderHook(({ enabled }) => useVoiceCommands({ adapter: speech, enabled, onCommand }), { initialProps: { enabled: false } })
    expect(speech.listening).toBe(false)
    rerender({ enabled: true })
    expect(speech.listening).toBe(true)
    speech.say('next')
    speech.say('hello there')
    speech.say('Pause the timer')
    expect(onCommand.mock.calls).toEqual([['next'], ['pauseTimer']])
    rerender({ enabled: false })
    expect(speech.listening).toBe(false)
  })

  it('does not listen where speech is unsupported', () => {
    const speech = new FakeSpeech(false)
    renderHook(() => useVoiceCommands({ adapter: speech, enabled: true, onCommand: vi.fn() }))
    expect(speech.startCalls).toBe(0)
  })

  it('stops on unmount and keeps listening when only the callback changes', () => {
    const speech = new FakeSpeech()
    const first = vi.fn()
    const second = vi.fn()
    const { rerender, unmount } = renderHook(({ cb }) => useVoiceCommands({ adapter: speech, enabled: true, onCommand: cb }), { initialProps: { cb: first } })
    rerender({ cb: second })
    expect(speech.startCalls).toBe(1)
    speech.say('back')
    expect(second).toHaveBeenCalledWith('back')
    expect(first).not.toHaveBeenCalled()
    unmount()
    expect(speech.listening).toBe(false)
  })
})

const T0 = Date.parse('2026-11-09T18:00:00Z')
function timer(id: number, state: CookTimer['state'], endsAt: string | null = '2026-11-09T18:05:00Z'): CookTimer {
  return { id, scope: null, step: null, label: `t${id}`, durationSeconds: 300, state, remainingSeconds: state === 'finished' ? 0 : 300, endsAt, startedAt: '2026-11-09T18:00:00Z' }
}

describe('useTimerAlarm', () => {
  it('rings when a timer turns finished while watching, and stops when it is dismissed', () => {
    const alarm = new FakeAlarm()
    const { result, rerender } = renderHook(({ timers }) => useTimerAlarm(timers, alarm, () => T0), { initialProps: { timers: [timer(1, 'running')] } })
    expect(alarm.ringing).toBe(false)
    rerender({ timers: [timer(1, 'finished', '2026-11-09T18:00:00Z')] })
    expect(alarm.ringing).toBe(true)
    expect(result.current.ringing).toBe(true)
    rerender({ timers: [] })
    expect(alarm.ringing).toBe(false)
    expect(result.current.ringing).toBe(false)
  })

  it('does not ring for a timer that was already finished when the page opened', () => {
    const alarm = new FakeAlarm()
    renderHook(() => useTimerAlarm([timer(1, 'finished')], alarm, () => T0))
    expect(alarm.playCalls).toBe(0)
  })

  it('keeps ringing while any finished timer is left', () => {
    const alarm = new FakeAlarm()
    const { rerender } = renderHook(({ timers }) => useTimerAlarm(timers, alarm, () => T0), { initialProps: { timers: [timer(1, 'running'), timer(2, 'running')] } })
    rerender({ timers: [timer(1, 'finished'), timer(2, 'finished')] })
    rerender({ timers: [timer(2, 'finished')] })
    expect(alarm.ringing).toBe(true)
    rerender({ timers: [] })
    expect(alarm.ringing).toBe(false)
  })

  it('silences on unmount', () => {
    const alarm = new FakeAlarm()
    const { rerender, unmount } = renderHook(({ timers }) => useTimerAlarm(timers, alarm, () => T0), { initialProps: { timers: [timer(1, 'running')] } })
    rerender({ timers: [timer(1, 'finished')] })
    unmount()
    expect(alarm.ringing).toBe(false)
  })
})

describe('useVoicePreference', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('is off by default', () => {
    const { result } = renderHook(() => useVoicePreference())
    expect(result.current[0]).toBe(false)
  })

  it('remembers the choice on this device', () => {
    const { result } = renderHook(() => useVoicePreference())
    act(() => result.current[1](true))
    expect(result.current[0]).toBe(true)
    expect(localStorage.getItem('feeder.cook.voice')).toBe('1')
    expect(renderHook(() => useVoicePreference()).result.current[0]).toBe(true)
    act(() => result.current[1](false))
    expect(localStorage.getItem('feeder.cook.voice')).not.toBe('1')
  })

  it('treats a storage error as off and still toggles in memory', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => useVoicePreference())
    expect(result.current[0]).toBe(false)
    act(() => result.current[1](true))
    expect(result.current[0]).toBe(true)
  })
})
