// The ordered picture slots of the Photo tab: ImagePicker holds one picture, so the step shows one picker per photo and a
// trailing empty one (docs/dev/design/ra-e-import.md section 4.6). Plain TypeScript.
import type { RawImage } from '../../../ui/ImagePicker'

export type PhotoSlots = Array<RawImage | null>

const MAX_PHOTOS = 4

/** One empty slot. */
export function emptySlots(): PhotoSlots {
  return [null]
}
/** Sets slot `i` (null removes it). The result has the filled slots in order, then one empty slot unless 4 are filled. */
export function setSlot(slots: PhotoSlots, i: number, image: RawImage | null): PhotoSlots {
  const next = slots.slice()
  next[i] = image
  const filled = next.filter((s): s is RawImage => s !== null)
  return filled.length < MAX_PHOTOS ? [...filled, null] : filled
}
export function filledPhotos(slots: PhotoSlots): RawImage[] {
  return slots.filter((s): s is RawImage => s !== null)
}

let nextKey = 0
const keys = new WeakMap<object, string>()
/** One React key per slot: a photo keeps its key for as long as it is the same picture, so removing another photo does not remount its picker. */
export function slotKeys(slots: PhotoSlots): string[] {
  return slots.map((image, i) => {
    if (image === null) return `empty-${i}`
    let key = keys.get(image)
    if (!key) {
      key = `photo-${++nextKey}`
      keys.set(image, key)
    }
    return key
  })
}
