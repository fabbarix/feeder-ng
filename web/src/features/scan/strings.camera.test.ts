// B9-35 (SSP-06, SSP-12): the copy of Scan without a camera, as the chapter lists it. The names are the ones the developer adds to
// scanStrings (a name that is not here yet is `undefined`, so each test fails on the value, not on the import).
import { describe, expect, it } from 'vitest'
import { scanStrings } from './strings'

const s = scanStrings as unknown as Record<string, unknown>

describe('SSP-06 copy', () => {
  it.each([
    ['noCameraBar', 'No camera on this device'],
    ['cameraBarDenied', 'Feeder may not use the camera'],
    // main-session ruling: every camera bar message is short and fits one line at 375 px
    ['cameraBarInUse', 'The camera is busy'],
    ['cameraBarError', 'The camera did not start'],
    ['tryAgain', 'Try again'],
    ['typeBarcode', 'Type a barcode'],
    ['manualBarcodeHint', 'The digits under the bars. Press Use for each one.'],
    ['use', 'Use'],
    ['useBarcode', 'Use this barcode'],
    ['manualBarcodeLabel', 'Barcode'],
    ['closeManual', 'Back to the camera'],
    ['nothingScannedHintNoCamera', 'Type the digits under the bars. Lines to get are under To get.'],
    ['closePriceFirst', 'Close the Price first'],
  ])('%s', (name, text) => {
    expect(s[name]).toBe(text)
  })

  it('the words the chapter retires are gone: "Type the barcode instead" and "Try the camera again"', () => {
    expect(s.enterBarcode).toBeUndefined()
    expect(s.retryCamera).toBeUndefined()
  })

  it('with a camera the empty state still says to point it at a barcode', () => {
    expect(scanStrings.nothingScannedHint).toBe('Point the camera at a barcode. Lines to get are under To get.')
  })

  it('uses no word the GLOSSARY avoids', () => {
    const text = [s.noCameraBar, s.cameraBarDenied, s.typeBarcode, s.manualBarcodeHint, s.nothingScannedHintNoCamera, s.closePriceFirst].join(' ')
    expect(text).not.toMatch(/\b(cart|basket|item|discard)s?\b/i)
  })

  it('the Added toast says "Added <product>" (the headline of a plain success toast, no "!" and no status word)', () => {
    expect(scanStrings.added('Mutti passata 700 g')).toBe('Added Mutti passata 700 g')
  })
})
