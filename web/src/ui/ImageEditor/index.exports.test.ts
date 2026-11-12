import { describe, expect, it } from 'vitest'
import * as editor from './index'
import * as ui from '../index'

// photo-read.md section 9.1: T2's lines of the two barrels.
describe('the read engine and its libs are public', () => {
  for (const [name, mod] of [['ui/ImageEditor', editor], ['ui', ui]] as const) {
    it(`${name} exports the read engine, the limits, readHeaderSize and useObjectUrls`, () => {
      const m = mod as Record<string, unknown>
      expect(typeof m.browserImageEngine).toBe('object')
      expect(typeof m.readHeaderSize).toBe('function')
      expect(typeof m.useObjectUrls).toBe('function')
      expect(m.READ_MAX_SIDE).toBe(2576)
      expect(m.INPUT_MAX_BYTES).toBe(30 * 1024 * 1024)
      expect(m.INPUT_MAX_PIXELS).toBe(50_000_000)
      expect(m.AS_IS_MAX_BYTES).toBe(8 * 1024 * 1024)
    })
  }
  it('nothing more of the T2 libs leaks into the ui barrel', () => {
    const m = ui as Record<string, unknown>
    for (const name of ['readJpegInfo', 'orientationOps', 'workingSize', 'keepOriginal', 'readPngSize', 'readWebpSize']) expect(m[name]).toBeUndefined()
  })
})
