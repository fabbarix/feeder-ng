// The ZXing fallback reader (@zxing/browser), loaded only where the browser has no BarcodeDetector. It reads one
// frame at a time through an offscreen canvas. Not unit-tested (the camera is not in jsdom).
import type { Format } from './barcode'
import type { Detection, Detector } from './detector'

export async function createZxingDetector(): Promise<Detector> {
  const { BrowserMultiFormatReader, BarcodeFormat } = await import('@zxing/browser')
  const reader = new BrowserMultiFormatReader()
  const formats: [number, Exclude<Format, ''>][] = [
    [BarcodeFormat.EAN_13, 'ean_13'],
    [BarcodeFormat.EAN_8, 'ean_8'],
    [BarcodeFormat.UPC_A, 'upc_a'],
    [BarcodeFormat.UPC_E, 'upc_e'],
    [BarcodeFormat.CODE_128, 'code_128'],
    [BarcodeFormat.QR_CODE, 'qr_code'],
    [BarcodeFormat.DATA_MATRIX, 'data_matrix'],
  ]
  reader.possibleFormats = formats.map(([f]) => f)
  const byFormat = new Map<number, Exclude<Format, ''>>(formats)
  const canvas = typeof document === 'undefined' ? null : document.createElement('canvas')

  return {
    async detect(frame) {
      if (!canvas) return []
      const size = frame as { videoWidth?: number; videoHeight?: number; width?: number; height?: number }
      canvas.width = size.videoWidth ?? size.width ?? 0
      canvas.height = size.videoHeight ?? size.height ?? 0
      const ctx = canvas.getContext('2d')
      if (!ctx || canvas.width === 0 || canvas.height === 0) return []
      ctx.drawImage(frame as CanvasImageSource, 0, 0)
      try {
        const result = reader.decodeFromCanvas(canvas)
        const format = byFormat.get(result.getBarcodeFormat() as unknown as number)
        return format ? [{ rawValue: result.getText(), format } satisfies Detection] : []
      } catch {
        return []
      }
    },
  }
}
