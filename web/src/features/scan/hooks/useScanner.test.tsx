import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Detection, Detector } from '../lib/detector'
import { useScanner, type FrameSource } from './useScanner'

const frame = {} as CanvasImageSource
const source: FrameSource = { frame: () => frame }
const EAN: Detection = { rawValue: '8000500310427', format: 'ean_13' }

function fakeDetector(queue: Detection[][] = []): Detector & { detect: ReturnType<typeof vi.fn> } {
  const detect = vi.fn(async () => queue.shift() ?? [])
  return { detect }
}

async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useScanner', () => {
  it('reports a read once, parsed, however many frames see it', async () => {
    const detector = fakeDetector([[EAN], [EAN], [EAN]])
    const onScan = vi.fn()
    renderHook(() => useScanner({ detector, source, enabled: true, onScan, intervalMs: 100, cooldownMs: 1500 }))
    await tick(350)
    expect(detector.detect).toHaveBeenCalledWith(frame)
    expect(onScan).toHaveBeenCalledTimes(1)
    expect(onScan.mock.calls[0]?.[0]).toMatchObject({ kind: 'gtin', code: '08000500310427' })
    expect(onScan.mock.calls[0]?.[1]).toEqual(EAN)
  })

  it('reads the same code again after the cooldown', async () => {
    const detector = fakeDetector()
    detector.detect.mockResolvedValue([EAN])
    const onScan = vi.fn()
    renderHook(() => useScanner({ detector, source, enabled: true, onScan, intervalMs: 100, cooldownMs: 1000 }))
    await tick(950)
    expect(onScan).toHaveBeenCalledTimes(1)
    await tick(300)
    expect(onScan).toHaveBeenCalledTimes(2)
  })

  it('reads a different code straight away', async () => {
    const detector = fakeDetector([[EAN], [{ rawValue: '4000000000013', format: 'ean_13' }]])
    const onScan = vi.fn()
    renderHook(() => useScanner({ detector, source, enabled: true, onScan, intervalMs: 100, cooldownMs: 5000 }))
    await tick(250)
    expect(onScan).toHaveBeenCalledTimes(2)
  })

  it('does not read while disabled and resumes when enabled', async () => {
    const detector = fakeDetector()
    detector.detect.mockResolvedValue([EAN])
    const onScan = vi.fn()
    const { rerender } = renderHook(({ enabled }) => useScanner({ detector, source, enabled, onScan, intervalMs: 100, cooldownMs: 1000 }), {
      initialProps: { enabled: false },
    })
    await tick(500)
    expect(detector.detect).not.toHaveBeenCalled()
    rerender({ enabled: true })
    await tick(150)
    expect(onScan).toHaveBeenCalledTimes(1)
  })

  it('does nothing without a detector or a frame', async () => {
    const detector = fakeDetector()
    const onScan = vi.fn()
    renderHook(() => useScanner({ detector: null, source, enabled: true, onScan, intervalMs: 100 }))
    renderHook(() => useScanner({ detector, source: { frame: () => null }, enabled: true, onScan, intervalMs: 100 }))
    await tick(500)
    expect(detector.detect).not.toHaveBeenCalled()
    expect(onScan).not.toHaveBeenCalled()
  })

  it('never overlaps a slow detection', async () => {
    let release: (d: Detection[]) => void = () => {}
    const detect = vi.fn(() => new Promise<Detection[]>((r) => (release = r)))
    renderHook(() => useScanner({ detector: { detect }, source, enabled: true, onScan: vi.fn(), intervalMs: 100 }))
    await tick(500)
    expect(detect).toHaveBeenCalledTimes(1)
    release([])
    await tick(150)
    expect(detect).toHaveBeenCalledTimes(2)
  })

  it('passes unreadable and non-product reads on so the screen can react', async () => {
    const detector = fakeDetector([[{ rawValue: '8000500310428', format: 'ean_13' }], [{ rawValue: 'https://example.com', format: 'qr_code' }]])
    const onScan = vi.fn()
    renderHook(() => useScanner({ detector, source, enabled: true, onScan, intervalMs: 100 }))
    await tick(250)
    expect(onScan.mock.calls.map((c) => c[0].kind)).toEqual(['invalid', 'not_product'])
  })

  it('reports a detector error and keeps trying', async () => {
    const detect = vi.fn().mockRejectedValueOnce(new Error('wasm failed')).mockResolvedValue([])
    const { result } = renderHook(() => useScanner({ detector: { detect }, source, enabled: true, onScan: vi.fn(), intervalMs: 100 }))
    await tick(120)
    expect(result.current.error).toBe('wasm failed')
    await tick(120)
    expect(detect).toHaveBeenCalledTimes(2)
  })

  it('stops on unmount', async () => {
    const detector = fakeDetector()
    const { unmount } = renderHook(() => useScanner({ detector, source, enabled: true, onScan: vi.fn(), intervalMs: 100 }))
    await tick(150)
    const calls = detector.detect.mock.calls.length
    unmount()
    await tick(500)
    expect(detector.detect.mock.calls.length).toBe(calls)
  })
})
