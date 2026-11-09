// Runs the detector over the camera frames and reports each distinct read once. React hook; the reading itself is
// the Detector interface (tests pass a fake).
import { useEffect, useRef, useState } from 'react'
import type { Scanned } from '../lib/barcode'
import { createCooldown } from '../lib/cooldown'
import { toScanned, type Detection, type Detector } from '../lib/detector'

export interface FrameSource {
  /** the current frame, or null while the camera is not ready */
  frame(): CanvasImageSource | null
}

export interface UseScannerOptions {
  detector: Detector | null
  source: FrameSource | null
  /** false pauses reading (a sheet is open) without stopping the camera */
  enabled: boolean
  /** called once per read: the parsed code and the raw detection */
  onScan: (scanned: Scanned, detection: Detection) => void
  /** the same code is ignored for this long (default 1500) */
  cooldownMs?: number
  /** time between frames (default 150) */
  intervalMs?: number
}

export interface UseScannerResult {
  /** a detector error, or null */
  error: string | null
}

/**
 * Every intervalMs, while enabled and with a detector and a frame, calls detector.detect once at a time (a slow
 * detection is never overlapped). Each detection is parsed with toScanned and passed to onScan unless the same
 * code was handled inside the cooldown; `invalid` reads are passed too (the screen buzzes), `not_product` as well.
 * Stops on unmount and when enabled turns false; the cooldown is cleared when it turns false.
 */
export function useScanner(options: UseScannerOptions): UseScannerResult {
  const { detector, enabled, cooldownMs = 1500, intervalMs = 150 } = options
  const [error, setError] = useState<string | null>(null)
  const sourceRef = useRef(options.source)
  const onScanRef = useRef(options.onScan)
  sourceRef.current = options.source
  onScanRef.current = options.onScan

  useEffect(() => {
    if (!enabled || !detector) return
    const cooldown = createCooldown(cooldownMs)
    let stopped = false
    let busy = false
    const timer = setInterval(() => {
      const frame = sourceRef.current?.frame() ?? null
      if (busy || stopped || !frame) return
      busy = true
      detector
        .detect(frame)
        .then((found) => {
          if (stopped) return
          for (const d of found) {
            const scanned = toScanned(d)
            if (cooldown.accept(`${d.format}:${d.rawValue}`)) onScanRef.current(scanned, d)
          }
        })
        .catch((err: unknown) => {
          if (!stopped) setError(err instanceof Error ? err.message : String(err))
        })
        .finally(() => {
          busy = false
        })
    }, intervalMs)
    return () => {
      stopped = true
      clearInterval(timer)
      cooldown.reset()
    }
  }, [enabled, detector, cooldownMs, intervalMs])

  return { error }
}
