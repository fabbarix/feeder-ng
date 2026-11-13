import { describe, expect, it } from 'vitest'
import { ROW_GAP, scrollAboveSheet } from './sheetScroll'

describe('scrollAboveSheet: the row being priced sits just above the sheet', () => {
  it('a row under the sheet scrolls up into view above it', () => {
    expect(scrollAboveSheet({ top: 600, bottom: 664 }, 420)).toBe(664 + ROW_GAP - 420)
  })

  it('a row far above the sheet comes down to sit just above it', () => {
    expect(scrollAboveSheet({ top: 100, bottom: 164 }, 420)).toBe(164 + ROW_GAP - 420)
  })

  it('a row already in place does not move', () => {
    expect(scrollAboveSheet({ top: 348, bottom: 412 }, 420)).toBe(0)
    expect(scrollAboveSheet({ top: 348, bottom: 412.4 }, 420)).toBe(0)
  })

  it('takes a gap of its own', () => {
    expect(scrollAboveSheet({ top: 300, bottom: 400 }, 420, 0)).toBe(-20)
  })
})
