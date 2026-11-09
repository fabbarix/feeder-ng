import { describe, expect, it, vi } from 'vitest'
import { createFeedback, MUTE_KEY } from './feedback'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), data }
}

describe('createFeedback', () => {
  it('beeps and buzzes on a successful read', () => {
    const beep = vi.fn()
    const vibrate = vi.fn((_ms: number) => true)
    const fb = createFeedback({ beep, vibrate, storage: memoryStorage() })
    fb.confirm()
    expect(beep).toHaveBeenCalledTimes(1)
    expect(vibrate).toHaveBeenCalledTimes(1)
    expect(vibrate.mock.calls[0]?.[0]).toBeGreaterThan(0)
    expect(fb.canVibrate).toBe(true)
  })

  it('has only the beep where the vibration API is missing (iOS)', () => {
    const beep = vi.fn()
    const fb = createFeedback({ beep, storage: memoryStorage() })
    expect(() => fb.confirm()).not.toThrow()
    expect(beep).toHaveBeenCalledTimes(1)
    expect(fb.canVibrate).toBe(false)
  })

  it('the mute silences both and is kept per device', () => {
    const beep = vi.fn()
    const vibrate = vi.fn((_ms: number) => true)
    const storage = memoryStorage()
    const fb = createFeedback({ beep, vibrate, storage })
    expect(fb.isMuted()).toBe(false)
    fb.setMuted(true)
    fb.confirm()
    expect(beep).not.toHaveBeenCalled()
    expect(vibrate).not.toHaveBeenCalled()
    expect(storage.data[MUTE_KEY]).toBe('1')
    expect(createFeedback({ beep, vibrate, storage }).isMuted()).toBe(true)
    fb.setMuted(false)
    fb.confirm()
    expect(beep).toHaveBeenCalledTimes(1)
    expect(storage.data[MUTE_KEY]).toBe('0')
  })

  it('works when storage is missing or throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    for (const storage of [null, undefined, throwing]) {
      const beep = vi.fn()
      const fb = createFeedback({ beep, storage })
      expect(fb.isMuted()).toBe(false)
      expect(() => fb.setMuted(true)).not.toThrow()
      expect(fb.isMuted()).toBe(true) // remembered for this session at least
      fb.confirm()
      expect(beep).not.toHaveBeenCalled()
    }
  })

  it('a failed read buzzes without a beep, and stays quiet when muted', () => {
    const beep = vi.fn()
    const vibrate = vi.fn((_ms: number) => true)
    const fb = createFeedback({ beep, vibrate, storage: memoryStorage() })
    fb.reject()
    expect(beep).not.toHaveBeenCalled()
    expect(vibrate).toHaveBeenCalledTimes(1)
    fb.setMuted(true)
    fb.reject()
    expect(vibrate).toHaveBeenCalledTimes(1)
  })
})
