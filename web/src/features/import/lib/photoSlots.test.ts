// WP-G: the ordered picture slots of the Photo tab (up to 4, order kept; ImagePicker holds one picture each).
import { describe, expect, it } from 'vitest'
import type { RawImage } from '../../../ui/ImagePicker'
import { emptySlots, filledPhotos, setSlot, slotKeys } from './photoSlots'

const img = (n: number): RawImage => ({ kind: 'url', url: `https://example.com/${n}.jpg` })

describe('photoSlots', () => {
  it('starts with one empty slot', () => {
    expect(emptySlots()).toEqual([null])
  })
  it('filling a slot opens the next empty one', () => {
    expect(setSlot(emptySlots(), 0, img(1))).toEqual([img(1), null])
    expect(setSlot([img(1), null], 1, img(2))).toEqual([img(1), img(2), null])
  })
  it('stops at 4: no empty slot after the fourth photo', () => {
    const four = setSlot([img(1), img(2), img(3), null], 3, img(4))
    expect(four).toEqual([img(1), img(2), img(3), img(4)])
  })
  it('replacing a photo keeps its place', () => {
    expect(setSlot([img(1), img(2), null], 0, img(9))).toEqual([img(9), img(2), null])
  })
  it('removing a photo closes the gap and keeps the order', () => {
    expect(setSlot([img(1), img(2), img(3), null], 1, null)).toEqual([img(1), img(3), null])
    expect(setSlot([img(1), img(2), img(3), img(4)], 0, null)).toEqual([img(2), img(3), img(4), null])
  })
  it('removing the only photo leaves one empty slot', () => {
    expect(setSlot([img(1), null], 0, null)).toEqual([null])
  })
  it('never mutates its input', () => {
    const before = [img(1), null]
    setSlot(before, 0, null)
    expect(before).toEqual([img(1), null])
  })
  it('filledPhotos lists the pictures in order, without the empty slot', () => {
    expect(filledPhotos([img(1), img(2), null])).toEqual([img(1), img(2)])
    expect(filledPhotos([null])).toEqual([])
  })
})

describe('slotKeys', () => {
  it('gives every slot a distinct key', () => {
    const keys = slotKeys([img(1), img(2), null])
    expect(new Set(keys).size).toBe(3)
  })
  it('a photo keeps its key when another one is removed (its picker is not remounted)', () => {
    const [a, b, c] = [img(1), img(2), img(3)]
    const before = slotKeys([a, b, c, null])
    const after = slotKeys(setSlot([a, b, c, null], 0, null))
    expect(after.slice(0, 2)).toEqual([before[1], before[2]])
  })
  it('the same photo has the same key on every render', () => {
    const a = img(1)
    expect(slotKeys([a, null])[0]).toBe(slotKeys([a, null])[0])
  })
})
