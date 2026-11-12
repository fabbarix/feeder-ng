import { describe, expect, it } from 'vitest'
import { dragTo, initialEdit, isFullEdit, nudge, reset, turn, type ImageEdit } from './edit'

const SIZE = { width: 800, height: 600 }
const edit = (x: number, y: number, width: number, height: number, turns: ImageEdit['turns'] = 0): ImageEdit => ({ turns, crop: { x, y, width, height } })
const FULL = edit(0, 0, 800, 600)

describe('initialEdit, reset, isFullEdit', () => {
  it('free: no turn and the whole picture', () => {
    expect(initialEdit(SIZE)).toEqual(FULL)
    expect(reset(SIZE, 'free')).toEqual(FULL)
  })
  it('locked: the largest centred rect of that aspect', () => {
    expect(reset(SIZE, 1)).toEqual(edit(100, 0, 600, 600))
  })
  it('isFullEdit: only no turn and the whole picture', () => {
    expect(isFullEdit(FULL, SIZE)).toBe(true)
    expect(isFullEdit(edit(0, 0, 799, 600), SIZE)).toBe(false)
    expect(isFullEdit(edit(1, 0, 800, 600), SIZE)).toBe(false)
    expect(isFullEdit(edit(0, 0, 600, 800, 1), SIZE)).toBe(false) // turned, even if the crop is the whole turned picture
  })
})

describe('nudge', () => {
  const start = edit(100, 100, 400, 300)
  it('the step is 1 % of the long side of the turned picture (800 -> 8), Shift x10', () => {
    expect(nudge(start, SIZE, 'move', 'ArrowRight', false, 'free')).toEqual(edit(108, 100, 400, 300))
    expect(nudge(start, SIZE, 'move', 'ArrowRight', true, 'free')).toEqual(edit(180, 100, 400, 300))
  })
  it('the step is at least 1 px', () => {
    const tiny = { width: 40, height: 30 }
    expect(nudge(edit(10, 5, 20, 20), tiny, 'move', 'ArrowDown', false, 'free', 4)).toEqual(edit(10, 6, 20, 20))
  })
  it('the long side of the TURNED picture counts', () => {
    const portrait = { width: 600, height: 1200 }
    expect(nudge(edit(0, 0, 600, 1200), portrait, 'move', 'ArrowLeft', false, 'free')).toEqual(edit(0, 0, 600, 1200)) // already at the edge
    expect(nudge(edit(100, 0, 300, 300), portrait, 'move', 'ArrowLeft', false, 'free')).toEqual(edit(88, 0, 300, 300)) // 1200 / 100 = 12
  })
  it.each([
    ['ArrowLeft', edit(92, 100, 400, 300)],
    ['ArrowRight', edit(108, 100, 400, 300)],
    ['ArrowUp', edit(100, 92, 400, 300)],
    ['ArrowDown', edit(100, 108, 400, 300)],
  ])('move: %s', (key, want) => {
    expect(nudge(start, SIZE, 'move', key, false, 'free')).toEqual(want)
  })
  it('a handle moves its own side only (free)', () => {
    expect(nudge(start, SIZE, 'e', 'ArrowRight', false, 'free')).toEqual(edit(100, 100, 408, 300))
    expect(nudge(start, SIZE, 'w', 'ArrowLeft', false, 'free')).toEqual(edit(92, 100, 408, 300))
    expect(nudge(start, SIZE, 'n', 'ArrowUp', false, 'free')).toEqual(edit(100, 92, 400, 308))
    expect(nudge(start, SIZE, 's', 'ArrowDown', false, 'free')).toEqual(edit(100, 100, 400, 308))
  })
  it('a corner moves one axis per key', () => {
    expect(nudge(start, SIZE, 'se', 'ArrowRight', false, 'free')).toEqual(edit(100, 100, 408, 300))
    expect(nudge(start, SIZE, 'se', 'ArrowDown', false, 'free')).toEqual(edit(100, 100, 400, 308))
    expect(nudge(start, SIZE, 'nw', 'ArrowLeft', false, 'free')).toEqual(edit(92, 100, 408, 300))
  })
  it('keeps the turns', () => {
    expect(nudge(edit(0, 0, 600, 800, 1), SIZE, 'move', 'ArrowDown', false, 'free')?.turns).toBe(1)
  })
  it('stops at the edges and at minSide', () => {
    expect(nudge(edit(0, 0, 400, 300), SIZE, 'move', 'ArrowLeft', false, 'free')).toEqual(edit(0, 0, 400, 300))
    expect(nudge(edit(100, 100, 165, 300), SIZE, 'e', 'ArrowLeft', true, 'free', 160)).toEqual(edit(100, 100, 160, 300))
  })
  it.each(['Enter', 'a', 'Home', 'End', 'PageUp', 'PageDown', 'Tab', 'Escape'])('%s -> null', (key) => {
    expect(nudge(start, SIZE, 'move', key, false, 'free')).toBeNull()
  })
  it('locked: keeps the aspect on a corner', () => {
    const out = nudge(edit(100, 0, 600, 600), SIZE, 'se', 'ArrowLeft', true, 1)
    expect(out?.crop.width).toBe(out?.crop.height)
    expect(out!.crop.width).toBeLessThan(600)
  })
})

describe('dragTo', () => {
  const start = edit(100, 100, 400, 300)
  it('scales the delta by bounds.width / viewWidth (800 shown at 400 px: x2)', () => {
    expect(dragTo(start, SIZE, 'move', 20, 10, 400, 'free')).toEqual(edit(140, 120, 400, 300))
    expect(dragTo(start, SIZE, 'e', 20, 0, 400, 'free')).toEqual(edit(100, 100, 440, 300))
  })
  it('scales by the TURNED width', () => {
    const turned = edit(0, 0, 600, 800, 1) // turned picture 600 x 800
    expect(dragTo(edit(0, 0, 300, 400, 1), SIZE, 'move', 30, 0, 300, 'free')).toEqual(edit(60, 0, 300, 400, 1))
    expect(turned.turns).toBe(1)
  })
  it('works from the edit the drag began with: two drags from the same start do not drift', () => {
    const a = dragTo(start, SIZE, 'move', 20, 0, 400, 'free')
    const b = dragTo(start, SIZE, 'move', 20, 0, 400, 'free')
    expect(b).toEqual(a)
    expect(start).toEqual(edit(100, 100, 400, 300))
  })
  it('viewWidth 0 -> unchanged', () => {
    expect(dragTo(start, SIZE, 'move', 50, 50, 0, 'free')).toEqual(start)
  })
  it('stops at the edges and at minSide', () => {
    expect(dragTo(start, SIZE, 'move', 9999, 9999, 400, 'free')).toEqual(edit(400, 300, 400, 300))
    expect(dragTo(start, SIZE, 'e', -9999, 0, 400, 'free', 160)).toEqual(edit(100, 100, 160, 300))
  })
  it('locked: a corner keeps the aspect, the opposite corner stays', () => {
    const out = dragTo(edit(100, 0, 600, 600), SIZE, 'se', -100, -100, 400, 1)
    expect(out.crop.width).toBe(out.crop.height)
    expect(out.crop.x).toBe(100)
    expect(out.crop.y).toBe(0)
  })
})

describe('turn', () => {
  it('turns clockwise and counter-clockwise, mapping a free crop to the same area', () => {
    const cw = turn(edit(100, 50, 300, 200), SIZE, 1, 'free')
    expect(cw).toEqual(edit(600 - 50 - 200, 100, 200, 300, 1))
    const back = turn(cw, { width: 800, height: 600 }, -1, 'free')
    expect(back).toEqual(edit(100, 50, 300, 200, 0))
  })
  it('keeps the area (width x height) for a free crop', () => {
    const out = turn(edit(10, 20, 300, 200), SIZE, 1, 'free')
    expect(out.crop.width * out.crop.height).toBe(300 * 200)
  })
  it('four turns return to the start', () => {
    let e = edit(100, 50, 300, 200)
    for (let i = 0; i < 4; i++) e = turn(e, SIZE, 1, 'free')
    expect(e).toEqual(edit(100, 50, 300, 200, 0))
  })
  it('locked: the crop starts again, centred, in the turned picture', () => {
    const out = turn(edit(100, 0, 600, 600), SIZE, 1, 1)
    expect(out.turns).toBe(1)
    expect(out.crop).toEqual({ x: 0, y: 100, width: 600, height: 600 })
  })
  it('wraps the turns number', () => {
    expect(turn(edit(0, 0, 800, 600, 0), SIZE, -1, 'free').turns).toBe(3)
  })
})
