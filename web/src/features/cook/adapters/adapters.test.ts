import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWebAudioAlarm, type AudioContextLike } from './alarm'
import { createBrowserSpeech, type RecognitionLike } from './speech'
import { createWakeLock, type SentinelLike } from './wakeLock'

class FakeRecognition implements RecognitionLike {
  static last: FakeRecognition | null = null
  continuous = false
  interimResults = true
  lang = ''
  onresult: RecognitionLike['onresult'] = null
  onend: RecognitionLike['onend'] = null
  onerror: RecognitionLike['onerror'] = null
  starts = 0
  stops = 0
  constructor() {
    FakeRecognition.last = this
  }
  start() {
    this.starts += 1
  }
  stop() {
    this.stops += 1
  }
  hear(text: string, isFinal = true) {
    const result = Object.assign([{ transcript: text }], { isFinal })
    this.onresult?.({ resultIndex: 0, results: [result] })
  }
}

describe('createBrowserSpeech', () => {
  beforeEach(() => {
    FakeRecognition.last = null
  })

  it('is unsupported without a SpeechRecognition constructor', () => {
    const speech = createBrowserSpeech({})
    expect(speech.supported).toBe(false)
    expect(() => speech.start(() => {})).not.toThrow()
    expect(() => speech.stop()).not.toThrow()
  })

  it('uses the webkit-prefixed constructor too', () => {
    expect(createBrowserSpeech({ webkitSpeechRecognition: FakeRecognition }).supported).toBe(true)
  })

  it('listens continuously for final results only and passes trimmed transcripts on', () => {
    const speech = createBrowserSpeech({ SpeechRecognition: FakeRecognition })
    const heard: string[] = []
    speech.start((t) => heard.push(t))
    const rec = FakeRecognition.last!
    expect(rec.continuous).toBe(true)
    expect(rec.interimResults).toBe(false)
    expect(rec.starts).toBe(1)
    rec.hear('  next step ')
    rec.hear('ne', false)
    expect(heard).toEqual(['next step'])
  })

  it('starting twice listens once; stop stops', () => {
    const speech = createBrowserSpeech({ SpeechRecognition: FakeRecognition })
    speech.start(() => {})
    speech.start(() => {})
    const rec = FakeRecognition.last!
    expect(rec.starts).toBe(1)
    speech.stop()
    expect(rec.stops).toBe(1)
  })

  it('restarts after the browser ends recognition while started, not after stop', () => {
    const speech = createBrowserSpeech({ SpeechRecognition: FakeRecognition })
    speech.start(() => {})
    const rec = FakeRecognition.last!
    rec.onend?.()
    expect(rec.starts).toBe(2)
    speech.stop()
    rec.onend?.()
    expect(rec.starts).toBe(2)
  })

  it('gives up for good when the microphone is refused', () => {
    const speech = createBrowserSpeech({ SpeechRecognition: FakeRecognition })
    speech.start(() => {})
    const rec = FakeRecognition.last!
    rec.onerror?.({ error: 'not-allowed' })
    rec.onend?.()
    expect(rec.starts).toBe(1)
  })
})

function sentinel() {
  let onRelease: (() => void) | null = null
  const s: SentinelLike & { released: number; drop(): void } = {
    released: 0,
    release: vi.fn(async () => {
      s.released += 1
    }),
    addEventListener: (_t, l) => {
      onRelease = l
    },
    drop() {
      onRelease?.()
    },
  }
  return s
}

describe('createWakeLock', () => {
  it('is unsupported without navigator.wakeLock and never throws', async () => {
    const lock = createWakeLock({})
    expect(lock.supported).toBe(false)
    await expect(lock.acquire()).resolves.toBeUndefined()
    await expect(lock.release()).resolves.toBeUndefined()
  })

  it('requests a screen lock once while held', async () => {
    const s = sentinel()
    const request = vi.fn(async () => s)
    const lock = createWakeLock({ wakeLock: { request } })
    await lock.acquire()
    await lock.acquire()
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('screen')
    await lock.release()
    expect(s.released).toBe(1)
    await lock.release()
    expect(s.released).toBe(1)
  })

  it('requests again after the system dropped the lock', async () => {
    const first = sentinel()
    const second = sentinel()
    const request = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    const lock = createWakeLock({ wakeLock: { request } })
    await lock.acquire()
    first.drop()
    await lock.acquire()
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('swallows a refusal', async () => {
    const lock = createWakeLock({ wakeLock: { request: vi.fn().mockRejectedValue(new Error('NotAllowedError')) } })
    await expect(lock.acquire()).resolves.toBeUndefined()
  })
})

function audio(): AudioContextLike & { beeps: number; closed: boolean } {
  const ctx = {
    beeps: 0,
    closed: false,
    currentTime: 0,
    destination: {},
    state: 'running',
    resume: async () => {},
    close: async () => {
      ctx.closed = true
    },
    createOscillator: () => ({
      frequency: { value: 0 },
      connect: () => {},
      start: () => {
        ctx.beeps += 1
      },
      stop: () => {},
    }),
    createGain: () => ({ gain: { value: 1 }, connect: () => {} }),
  }
  return ctx
}

describe('createWebAudioAlarm', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('beeps at once and then every second until stopped', () => {
    const ctx = audio()
    const alarm = createWebAudioAlarm(() => ctx)
    alarm.play()
    expect(ctx.beeps).toBe(1)
    vi.advanceTimersByTime(3000)
    expect(ctx.beeps).toBe(4)
    alarm.stop()
    vi.advanceTimersByTime(5000)
    expect(ctx.beeps).toBe(4)
  })

  it('playing twice rings once', () => {
    const ctx = audio()
    const alarm = createWebAudioAlarm(() => ctx)
    alarm.play()
    alarm.play()
    vi.advanceTimersByTime(1000)
    expect(ctx.beeps).toBe(2)
  })

  it('is silent, not broken, without audio', () => {
    const alarm = createWebAudioAlarm(() => null)
    expect(() => alarm.play()).not.toThrow()
    expect(() => alarm.stop()).not.toThrow()
  })
})
