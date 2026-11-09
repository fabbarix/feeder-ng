// Runs the detector over the camera frames and reports each distinct read once. React hook; the reading itself is
// the Detector interface (tests pass a fake). Stubs until implemented.
import type { Scanned } from '../lib/barcode'
import type { Detection, Detector } from '../lib/detector'

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
  void options
  throw new Error('not implemented')
}
