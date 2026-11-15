// RX-04 and ruling 6: the room the hero line's Tags get after the lead chips, which never collapse and wrap when they alone are too wide.
import { describe, expect, it } from 'vitest'
import { tagRoom } from './heroChipLine'

describe('tagRoom', () => {
  it('is the full width when there are no lead chips', () => {
    expect(tagRoom(340, null, [60, 70], 6, 32)).toBe(340)
  })
  it('is the room after the last lead chip when every Tag fits there', () => {
    expect(tagRoom(340, 200, [60, 70], 6, 32)).toBe(200)
  })
  it('is the room after the last lead chip when one Tag and the "+N" fit there', () => {
    expect(tagRoom(340, 120, [60, 70, 80], 6, 32)).toBe(120)
  })
  it('is the next line\'s full width when not even one Tag and the "+N" fit after the lead chips', () => {
    expect(tagRoom(340, 50, [60, 70, 80], 6, 32)).toBe(340)
    expect(tagRoom(340, -6, [60], 6, 32)).toBe(340)
  })
  it('is the full width with no Tags at all', () => {
    expect(tagRoom(340, 10, [], 6, 32)).toBe(340)
  })
})
