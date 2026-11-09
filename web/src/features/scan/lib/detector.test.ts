import { describe, expect, it, vi } from 'vitest'
import { chooseDetector, createNativeDetector, SCAN_FORMATS, toScanned, type Detector, type NativeBarcodeDetectorCtor } from './detector'

const frame = {} as CanvasImageSource

function fakeNative(supported: string[] | undefined, found: { rawValue: string; format: string }[] = []) {
  const instances: { formats?: string[] }[] = []
  class Native {
    constructor(options?: { formats?: string[] }) {
      instances.push(options ?? {})
    }
    detect = vi.fn(async () => found)
    static getSupportedFormats = supported ? async () => supported : undefined
  }
  return { Ctor: Native as unknown as NativeBarcodeDetectorCtor, instances }
}

describe('SCAN_FORMATS', () => {
  it('lists the seven formats of the spec', () => {
    expect([...SCAN_FORMATS].sort()).toEqual(['code_128', 'data_matrix', 'ean_13', 'ean_8', 'qr_code', 'upc_a', 'upc_e'])
  })
})

describe('createNativeDetector', () => {
  it('asks the browser only for the formats it supports out of the seven', async () => {
    const { Ctor, instances } = fakeNative(['ean_13', 'qr_code', 'itf', 'pdf417'])
    expect(await createNativeDetector(Ctor)).not.toBeNull()
    expect(instances[0]?.formats?.sort()).toEqual(['ean_13', 'qr_code'])
  })

  it('asks for all seven when the browser cannot list its formats', async () => {
    const { Ctor, instances } = fakeNative(undefined)
    await createNativeDetector(Ctor)
    expect([...(instances[0]?.formats ?? [])].sort()).toEqual([...SCAN_FORMATS].sort())
  })

  it('is null when none of the seven is supported', async () => {
    expect(await createNativeDetector(fakeNative(['itf']).Ctor)).toBeNull()
  })

  it('drops detections in formats outside the seven', async () => {
    const { Ctor } = fakeNative(['ean_13'], [
      { rawValue: '8000500310427', format: 'ean_13' },
      { rawValue: '12345', format: 'itf' },
    ])
    const det = await createNativeDetector(Ctor)
    expect(await det?.detect(frame)).toEqual([{ rawValue: '8000500310427', format: 'ean_13' }])
  })
})

describe('chooseDetector', () => {
  const zxing: Detector = { detect: async () => [{ rawValue: 'zx', format: 'code_128' }] }

  it('prefers the native BarcodeDetector', async () => {
    const createZxing = vi.fn(async () => zxing)
    const { Ctor } = fakeNative(['ean_13'], [{ rawValue: '8000500310427', format: 'ean_13' }])
    const det = await chooseDetector({ BarcodeDetector: Ctor, createZxing })
    expect(await det.detect(frame)).toEqual([{ rawValue: '8000500310427', format: 'ean_13' }])
    expect(createZxing).not.toHaveBeenCalled()
  })

  it('falls back to ZXing without a BarcodeDetector', async () => {
    const det = await chooseDetector({ createZxing: async () => zxing })
    expect(await det.detect(frame)).toEqual([{ rawValue: 'zx', format: 'code_128' }])
  })

  it('falls back to ZXing when the native one reads none of our formats', async () => {
    const det = await chooseDetector({ BarcodeDetector: fakeNative(['itf']).Ctor, createZxing: async () => zxing })
    expect(await det.detect(frame)).toEqual([{ rawValue: 'zx', format: 'code_128' }])
  })
})

describe('toScanned', () => {
  it('parses an EAN-13 to its canonical code', () => {
    expect(toScanned({ rawValue: '8000500310427', format: 'ean_13' })).toMatchObject({ kind: 'gtin', code: '08000500310427' })
  })

  it('reads the GTIN of a GS1 Digital Link in a QR code', () => {
    expect(toScanned({ rawValue: 'https://id.gs1.org/01/08000500310427', format: 'qr_code' })).toMatchObject({ kind: 'gtin', code: '08000500310427' })
  })

  it('ignores other QR content', () => {
    expect(toScanned({ rawValue: 'WIFI:S:home;;', format: 'qr_code' }).kind).toBe('not_product')
  })

  it('keeps a Code 128 label opaque', () => {
    expect(toScanned({ rawValue: 'SHOP-42', format: 'code_128' })).toMatchObject({ kind: 'opaque', code: 'SHOP-42' })
  })
})
