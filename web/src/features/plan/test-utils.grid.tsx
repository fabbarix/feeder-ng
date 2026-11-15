// B9-32: a ResizeObserver the test fires by hand (the week grid and the chip line measure with one; jsdom has none).
import { vi } from 'vitest'

export interface FakeObserver {
  callback: ResizeObserverCallback
  targets: Element[]
  disconnected: boolean
}

/** Installs the fake; `fire(width, target?)` reports a content width to every observer of `target` (default: all). Call `restore()` after. */
export function installResizeObserver() {
  const observers: FakeObserver[] = []
  vi.stubGlobal(
    'ResizeObserver',
    class {
      private record: FakeObserver
      constructor(callback: ResizeObserverCallback) {
        this.record = { callback, targets: [], disconnected: false }
        observers.push(this.record)
      }
      observe(target: Element) {
        this.record.targets.push(target)
      }
      unobserve() {}
      disconnect() {
        this.record.disconnected = true
      }
    },
  )
  return {
    observers,
    fire(width: number, only?: Element) {
      for (const o of observers) {
        if (o.disconnected) continue
        const targets = only ? o.targets.filter((t) => t === only) : o.targets
        if (targets.length === 0) continue
        o.callback(
          targets.map((target) => ({ target, contentRect: { width, height: 0, x: 0, y: 0, top: 0, left: 0, right: width, bottom: 0 }, contentBoxSize: [{ inlineSize: width, blockSize: 0 }], borderBoxSize: [{ inlineSize: width, blockSize: 0 }], devicePixelContentBoxSize: [] }) as unknown as ResizeObserverEntry),
          {} as ResizeObserver,
        )
      }
    },
    restore: () => vi.unstubAllGlobals(),
  }
}
