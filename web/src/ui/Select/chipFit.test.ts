// B9-15 (SET-06 build notes, the Shop's narrow-chips exception): a chip Select shows its short value only when its own container has no
// room for the full one. The rule is pure; the measure reads the DOM and answers null where nothing is laid out (jsdom: the full value shows).
import { describe, expect, it } from 'vitest'
import { chipShowsFull, measureChipFit } from './chipFit'

describe('chipShowsFull', () => {
  it('fits exactly: the full value shows', () => {
    expect(chipShowsFull({ natural: 120, room: 120 })).toBe(true)
  })
  it('1 px short: the short value shows', () => {
    expect(chipShowsFull({ natural: 121, room: 120 })).toBe(false)
  })
  it('a chip showing its short value goes back to the full one only with 2 px to spare (a row on a sub-pixel boundary settles)', () => {
    expect(chipShowsFull({ natural: 120, room: 121 }, false)).toBe(false)
    expect(chipShowsFull({ natural: 120, room: 122 }, false)).toBe(true)
  })
  it('an unmeasured chip (null) shows the full value', () => {
    expect(chipShowsFull(null)).toBe(true)
  })
})

describe('measureChipFit', () => {
  it('answers null for a frame with no layout (0 px: jsdom, or not shown)', () => {
    const frame = document.createElement('div')
    frame.innerHTML = '<div class="select"><button class="select__trigger"></button><span class="select__measure">Any Shop</span></div>'
    expect(measureChipFit(frame)).toBeNull()
  })
})
