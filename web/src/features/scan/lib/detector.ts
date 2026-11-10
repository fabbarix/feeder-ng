// The camera's barcode reader behind an interface, so hooks and tests use a fake (functional spec §10.4).
// BarcodeDetector where the browser has it, else ZXing (@zxing/browser). Plain TypeScript. Stubs until implemented.
import { parse, type Format, type Scanned } from './barcode'

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
  const supported = Ctor.getSupportedFormats ? await Ctor.getSupportedFormats() : undefined
  const formats = supported ? SCAN_FORMATS.filter((f) => supported.includes(f)) : [...SCAN_FORMATS]
  if (formats.length === 0) return null
  const native = new Ctor({ formats: [...formats] })
  const ours = new Set<string>(SCAN_FORMATS)
  return {
    async detect(frame) {
      const found = await native.detect(frame)
      return found
        .filter((d) => ours.has(d.format))
        .map((d) => ({ rawValue: d.rawValue, format: d.format as Exclude<Format, ''> }))
    },
  }
}

export interface DetectorEnv {
  BarcodeDetector?: NativeBarcodeDetectorCtor
  /** builds the ZXing reader lazily (a dynamic import of @zxing/browser), only when the native one is not usable */
  createZxing: () => Promise<Detector>
}

/** Native when it exists and supports at least one format; otherwise ZXing. */
export async function chooseDetector(env: DetectorEnv): Promise<Detector> {
  if (env.BarcodeDetector) {
    const native = await createNativeDetector(env.BarcodeDetector)
    if (native) return native
  }
  return env.createZxing()
}

/**
 * A detection as a Scanned code: barcode.parse(rawValue, format). A GS1 Digital Link QR yields its GTIN,
 * other QR content is `not_product`.
 */
export function toScanned(d: Detection): Scanned {
  return parse(d.rawValue, d.format)
}
