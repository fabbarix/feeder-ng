// The camera's barcode reader behind an interface, so hooks and tests use a fake (functional spec §10.4).
// BarcodeDetector where the browser has it, else ZXing (@zxing/browser). Plain TypeScript. Stubs until implemented.
import type { Format, Scanned } from './barcode'

/** The seven formats the app reads. */
export const SCAN_FORMATS: readonly Exclude<Format, ''>[] = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code', 'data_matrix']

export interface Detection {
  rawValue: string
  /** one of SCAN_FORMATS */
  format: Exclude<Format, ''>
}

/** A reader of single frames (a video element, a canvas or an ImageBitmap). */
export interface Detector {
  detect(frame: CanvasImageSource): Promise<Detection[]>
}

/** The slice of the browser's BarcodeDetector the app uses. */
export interface NativeBarcodeDetectorCtor {
  new (options?: { formats?: string[] }): { detect(frame: CanvasImageSource): Promise<{ rawValue: string; format: string }[]> }
  getSupportedFormats?: () => Promise<string[]>
}

/**
 * Wraps a native BarcodeDetector constructed with the formats it supports out of SCAN_FORMATS.
 * Detections in any other format (itf, pdf417, ...) are dropped. Resolves to null when none of the seven is supported.
 */
export async function createNativeDetector(Ctor: NativeBarcodeDetectorCtor): Promise<Detector | null> {
  void Ctor
  throw new Error('not implemented')
}

export interface DetectorEnv {
  BarcodeDetector?: NativeBarcodeDetectorCtor
  /** builds the ZXing reader lazily (a dynamic import of @zxing/browser), only when the native one is not usable */
  createZxing: () => Promise<Detector>
}

/** Native when it exists and supports at least one format; otherwise ZXing. */
export async function chooseDetector(env: DetectorEnv): Promise<Detector> {
  void env
  throw new Error('not implemented')
}

/**
 * A detection as a Scanned code: barcode.parse(rawValue, format). A GS1 Digital Link QR yields its GTIN,
 * other QR content is `not_product`.
 */
export function toScanned(d: Detection): Scanned {
  void d
  throw new Error('not implemented')
}
