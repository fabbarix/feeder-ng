import { describe, expect, it } from 'vitest'
import {
  clampRect,
  CROP_ASPECTS,
  handleLabel,
  handlesFor,
  initialCrop,
  isFullImage,
  MIN_CROP_PX,
  moveRect,
  outputSize,
  rectInSource,
  rectToPercent,
  resizeRect,
  rotateCrop,
  type Handle,
  type Rect,
  type Size,
} from './crop'

const B = (width: number, height: number): Size => ({ width, height })
const R = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height })

describe('presets', () => {
  it('4:3 for Recipe and Ingredient images, 1:1 for the Member avatar, free for "read from a photo"', () => {
    expect(CROP_ASPECTS.landscape).toBeCloseTo(4 / 3, 10)
    expect(CROP_ASPECTS.square).toBe(1)
    expect(CROP_ASPECTS.free).toBe('free')
  })
  it('the smallest side is 16 px', () => expect(MIN_CROP_PX).toBe(16))
})

describe('initialCrop', () => {
  it('free: the whole picture', () => expect(initialCrop(B(4000, 3000), 'free')).toEqual(R(0, 0, 4000, 3000)))
  it('4:3 on a 4:3 picture: the whole picture', () => expect(initialCrop(B(4000, 3000), 4 / 3)).toEqual(R(0, 0, 4000, 3000)))
  it('4:3 on a portrait picture: full width, centred vertically', () => expect(initialCrop(B(3000, 4000), 4 / 3)).toEqual(R(0, 875, 3000, 2250)))
  it('1:1 on a landscape picture: a centred square', () => expect(initialCrop(B(800, 600), 1)).toEqual(R(100, 0, 600, 600)))
  it('1:1 on a portrait picture', () => expect(initialCrop(B(600, 800), 1)).toEqual(R(0, 100, 600, 600)))
  it('a wide aspect on a square picture is full width and centred vertically', () => expect(initialCrop(B(1000, 1000), 2)).toEqual(R(0, 250, 1000, 500)))
  it('always whole pixels', () => {
    const r = initialCrop(B(1001, 777), 4 / 3)
    for (const v of Object.values(r)) expect(Number.isInteger(v)).toBe(true)
  })
})

describe('clampRect', () => {
  it('leaves a rect that fits alone', () => expect(clampRect(R(10, 10, 100, 50), B(200, 100))).toEqual(R(10, 10, 100, 50)))
  it('shifts a rect that sticks out instead of shrinking it', () => {
    expect(clampRect(R(-10, 5, 100, 50), B(200, 100))).toEqual(R(0, 5, 100, 50))
    expect(clampRect(R(180, 80, 100, 50), B(200, 100))).toEqual(R(100, 50, 100, 50))
  })
  it('a rect bigger than the picture becomes the picture', () => expect(clampRect(R(5, 5, 500, 500), B(200, 100))).toEqual(R(0, 0, 200, 100)))
  it('enforces the minimum side', () => expect(clampRect(R(10, 10, 3, 3), B(200, 100))).toEqual(R(10, 10, 16, 16)))
  it('a picture smaller than the minimum can still be "cropped" to itself', () => expect(clampRect(R(0, 0, 5, 5), B(10, 10))).toEqual(R(0, 0, 10, 10)))
})

describe('moveRect', () => {
  const rect = R(10, 10, 100, 50)
  it('moves without changing the size', () => expect(moveRect(rect, 20, 15, B(200, 100))).toEqual(R(30, 25, 100, 50)))
  it('stops at every edge', () => {
    expect(moveRect(rect, 500, 0, B(200, 100))).toEqual(R(100, 10, 100, 50))
    expect(moveRect(rect, -500, 0, B(200, 100))).toEqual(R(0, 10, 100, 50))
    expect(moveRect(rect, 0, 500, B(200, 100))).toEqual(R(10, 50, 100, 50))
    expect(moveRect(rect, 0, -500, B(200, 100))).toEqual(R(10, 0, 100, 50))
  })
})

describe('resizeRect, free', () => {
  const rect = R(10, 10, 100, 50)
  const bounds = B(200, 100)
  it('a corner moves two sides, the opposite corner stays', () => {
    expect(resizeRect(rect, 'se', 30, 20, bounds, 'free')).toEqual(R(10, 10, 130, 70))
    expect(resizeRect(rect, 'nw', -5, -5, bounds, 'free')).toEqual(R(5, 5, 105, 55))
    expect(resizeRect(rect, 'ne', 10, -5, bounds, 'free')).toEqual(R(10, 5, 110, 55))
    expect(resizeRect(rect, 'sw', -5, 10, bounds, 'free')).toEqual(R(5, 10, 105, 60))
  })
  it('an edge changes only its own side', () => {
    expect(resizeRect(rect, 'e', 25, 99, bounds, 'free')).toEqual(R(10, 10, 125, 50))
    expect(resizeRect(rect, 'w', -4, 99, bounds, 'free')).toEqual(R(6, 10, 104, 50))
    expect(resizeRect(rect, 's', 99, 7, bounds, 'free')).toEqual(R(10, 10, 100, 57))
    expect(resizeRect(rect, 'n', 99, -6, bounds, 'free')).toEqual(R(10, 4, 100, 56))
  })
  it('cannot go outside the picture', () => {
    expect(resizeRect(rect, 'nw', -50, 0, bounds, 'free')).toEqual(R(0, 10, 110, 50))
    expect(resizeRect(rect, 'e', 500, 0, bounds, 'free')).toEqual(R(10, 10, 190, 50))
    expect(resizeRect(rect, 's', 0, 500, bounds, 'free')).toEqual(R(10, 10, 100, 90))
  })
  it('cannot shrink below the minimum, and the far side stays put', () => {
    expect(resizeRect(rect, 'se', -500, -500, bounds, 'free')).toEqual(R(10, 10, 16, 16))
    expect(resizeRect(rect, 'nw', 500, 500, bounds, 'free')).toEqual(R(94, 44, 16, 16))
  })
  it('always returns whole pixels', () => {
    const r = resizeRect(rect, 'se', 3.4, 2.6, bounds, 'free')
    for (const v of Object.values(r)) expect(Number.isInteger(v)).toBe(true)
  })
})

describe('resizeRect, aspect locked', () => {
  const bounds = B(400, 300)
  const rect = R(100, 75, 200, 150) // 4:3
  const four3 = 4 / 3
  it('the opposite corner stays, the dominant axis decides, the other side follows', () => {
    expect(resizeRect(rect, 'se', 40, 0, bounds, four3)).toEqual(R(100, 75, 240, 180))
    expect(resizeRect(rect, 'se', 0, 30, bounds, four3)).toEqual(R(100, 75, 240, 180))
    expect(resizeRect(rect, 'nw', -40, 0, bounds, four3)).toEqual(R(60, 45, 240, 180))
    expect(resizeRect(rect, 'sw', -40, 0, bounds, four3)).toEqual(R(60, 75, 240, 180))
    expect(resizeRect(rect, 'ne', 40, 0, bounds, four3)).toEqual(R(100, 45, 240, 180))
  })
  it('stays inside the picture on whichever side runs out first', () => {
    expect(resizeRect(R(100, 50, 200, 150), 'se', 500, 0, bounds, four3)).toEqual(R(100, 50, 300, 225)) // right edge limits
    expect(resizeRect(R(100, 120, 160, 120), 'se', 500, 0, bounds, four3)).toEqual(R(100, 120, 240, 180)) // bottom edge limits
  })
  it('keeps the shorter side at the minimum or more', () => {
    const r = resizeRect(R(100, 100, 200, 200), 'se', -900, -900, bounds, 1)
    expect(r).toEqual(R(100, 100, 16, 16))
  })
  it('edge handles do nothing when the aspect is locked (they are not offered)', () => {
    for (const h of ['n', 'e', 's', 'w'] as const) expect(resizeRect(rect, h, 30, 30, bounds, four3)).toEqual(rect)
  })
  it('never breaks the lock, the bounds or the minimum over a long random drag sequence', () => {
    let seed = 7
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1
    const handles: Handle[] = ['nw', 'ne', 'se', 'sw']
    for (const aspect of [four3, 1, 0.5]) {
      let r = initialCrop(bounds, aspect)
      for (let i = 0; i < 300; i++) {
        r = resizeRect(r, handles[i % 4]!, rnd() * 120, rnd() * 120, bounds, aspect)
        if (i % 7 === 0) r = moveRect(r, rnd() * 80, rnd() * 80, bounds)
        expect(r.x).toBeGreaterThanOrEqual(0)
        expect(r.y).toBeGreaterThanOrEqual(0)
        expect(r.x + r.width).toBeLessThanOrEqual(bounds.width)
        expect(r.y + r.height).toBeLessThanOrEqual(bounds.height)
        expect(Math.min(r.width, r.height)).toBeGreaterThanOrEqual(MIN_CROP_PX)
        expect(Math.abs(r.width / r.height - aspect)).toBeLessThan(1 / Math.min(r.width, r.height) + 0.001)
      }
    }
  })
})

describe('rotateCrop', () => {
  it('free: the same area, turned with the picture', () => {
    expect(rotateCrop(R(100, 50, 200, 100), B(400, 300), 1, 'free')).toEqual(R(150, 100, 100, 200))
    expect(rotateCrop(R(100, 50, 200, 100), B(400, 300), -1, 'free')).toEqual(R(50, 100, 100, 200))
  })
  it('free: four clockwise turns bring the crop back', () => {
    let r = R(100, 50, 200, 100)
    let b = B(400, 300)
    for (let i = 0; i < 4; i++) {
      r = rotateCrop(r, b, 1, 'free')
      b = B(b.height, b.width)
    }
    expect(r).toEqual(R(100, 50, 200, 100))
  })
  it('free: a turn one way and back the other way is the identity', () => {
    const r = R(30, 20, 150, 90)
    expect(rotateCrop(rotateCrop(r, B(400, 300), 1, 'free'), B(300, 400), -1, 'free')).toEqual(r)
  })
  it('locked: the aspect belongs to the output, so the crop starts again for the turned picture', () => {
    expect(rotateCrop(R(10, 10, 100, 50), B(400, 200), 1, 2)).toEqual(R(0, 150, 200, 100))
    expect(rotateCrop(R(10, 10, 100, 50), B(400, 200), -1, 2)).toEqual(R(0, 150, 200, 100))
  })
})

describe('rectInSource (crop with rotation)', () => {
  it('no turn: unchanged', () => expect(rectInSource(R(10, 20, 100, 50), 0, 400, 300)).toEqual(R(10, 20, 100, 50)))
  it('one clockwise turn (the inverse of rotateCrop)', () => expect(rectInSource(R(150, 100, 100, 200), 1, 400, 300)).toEqual(R(100, 50, 200, 100)))
  it('two turns', () => expect(rectInSource(R(10, 20, 100, 50), 2, 400, 300)).toEqual(R(290, 230, 100, 50)))
  it('three turns (one counter-clockwise)', () => expect(rectInSource(R(50, 100, 100, 200), 3, 400, 300)).toEqual(R(100, 50, 200, 100)))
  it('agrees with rotateCrop for every turn count', () => {
    const src = R(40, 30, 200, 100)
    let turned = src
    let b = B(400, 300)
    for (const turns of [1, 2, 3] as const) {
      turned = rotateCrop(turned, b, 1, 'free')
      b = B(b.height, b.width)
      expect(rectInSource(turned, turns, 400, 300), `${turns} turns`).toEqual(src)
    }
  })
})

describe('outputSize', () => {
  it('never upscales', () => expect(outputSize(R(0, 0, 800, 600), 2576)).toEqual(B(800, 600)))
  it('scales the crop (not the picture) so the long edge fits', () => {
    expect(outputSize(R(100, 0, 4000, 3000), 2576)).toEqual(B(2576, 1932))
    expect(outputSize(R(0, 0, 3000, 4000), 2576)).toEqual(B(1932, 2576))
  })
  it('a small crop of a huge picture stays small', () => expect(outputSize(R(0, 0, 640, 480), 3200)).toEqual(B(640, 480)))
})

describe('rectToPercent / isFullImage / handles', () => {
  it('percentages of the bounds', () => expect(rectToPercent(R(100, 50, 200, 100), B(400, 200))).toEqual({ left: 25, top: 25, width: 50, height: 50 }))
  it('isFullImage', () => {
    expect(isFullImage(R(0, 0, 400, 200), B(400, 200))).toBe(true)
    expect(isFullImage(R(0, 0, 399, 200), B(400, 200))).toBe(false)
    expect(isFullImage(R(1, 0, 400, 200), B(400, 200))).toBe(false)
  })
  it('free: eight handles; locked: the four corners', () => {
    expect(handlesFor('free')).toEqual(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'])
    expect(handlesFor(4 / 3)).toEqual(['nw', 'ne', 'se', 'sw'])
  })
  it('every handle has a distinct, spoken name', () => {
    const names = handlesFor('free').map(handleLabel)
    expect(new Set(names).size).toBe(8)
    expect(handleLabel('nw')).toBe('Resize crop, top left corner')
    expect(handleLabel('se')).toBe('Resize crop, bottom right corner')
    expect(handleLabel('n')).toBe('Resize crop, top edge')
    expect(handleLabel('w')).toBe('Resize crop, left edge')
  })
})
