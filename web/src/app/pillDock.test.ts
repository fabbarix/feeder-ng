import { describe, expect, it } from 'vitest'
import { pillDock } from './pillDock'

const bar = { left: 80, top: 299, width: 571, height: 62 }
const pill = { width: 169, height: 52 }

describe('pillDock (PC-04 short viewports)', () => {
  it('docks at the bar\'s start, pad in, centred on its height, when the room before the first control fits the pill', () => {
    expect(pillDock(bar, 430, pill, 16, 375)).toEqual({ x: 96, y: 304 })
  })
  it('is null when the pill would reach the first control (less the pad)', () => {
    expect(pillDock(bar, 280, pill, 16, 375)).toBeNull()
    expect(pillDock(bar, 281, pill, 16, 375)).toEqual({ x: 96, y: 304 })
  })
  it('is null when the bar is not wholly on screen, or has no box', () => {
    expect(pillDock({ ...bar, top: 340 }, 430, pill, 16, 375)).toBeNull()
    expect(pillDock({ ...bar, top: -4 }, 430, pill, 16, 375)).toBeNull()
    expect(pillDock({ ...bar, width: 0 }, 430, pill, 16, 375)).toBeNull()
  })
})
