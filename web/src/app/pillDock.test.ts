import { describe, expect, it } from 'vitest'
import { pillDock, pillTopDock, TOP_DOCK_MIN_WIDTH } from './pillDock'

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

describe('pillTopDock (B9-55, int2 finding 2): the pill goes to the top bar when the bottom stack passes the 35 % chrome budget', () => {
  const at375 = { barTop: 499, pillHeight: 52, viewportHeight: 667, brandRight: 106, menuLeft: 319, gap: 12, lift: 16 }
  it('375 x 667 on a Recipe: the floating pill would make the bottom stack 35.4 %, so it starts 12 px after the brand', () => {
    expect(pillTopDock(at375)).toEqual({ x: 118, maxWidth: 189 })
  })
  it('390 x 844: the bottom stack is 28 %, the pill floats as usual', () => {
    expect(pillTopDock({ ...at375, barTop: 676, viewportHeight: 844 })).toBeNull()
  })
  it('no room for its icon, time and "+N" between the brand and Your menu: it floats', () => {
    expect(pillTopDock({ ...at375, menuLeft: 118 + 12 + TOP_DOCK_MIN_WIDTH - 1 })).toBeNull()
    expect(pillTopDock({ ...at375, menuLeft: 118 + 12 + TOP_DOCK_MIN_WIDTH })).toEqual({ x: 118, maxWidth: TOP_DOCK_MIN_WIDTH })
  })
})
