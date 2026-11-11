// The ordered picture slots of the Photo tab: ImagePicker holds one picture, so the step shows one picker per photo and a
// trailing empty one (docs/dev/design/ra-e-import.md section 4.6). Plain TypeScript.
import type { RawImage } from '../../../ui/ImagePicker'

export type PhotoSlots = Array<RawImage | null>

/** One empty slot. */
export function emptySlots(): PhotoSlots {
  throw new Error('TODO(ra-e developer): not implemented')
}
/** Sets slot `i` (null removes it). The result has the filled slots in order, then one empty slot unless 4 are filled. */
export function setSlot(slots: PhotoSlots, i: number, image: RawImage | null): PhotoSlots {
  void slots
  void i
  void image
  throw new Error('TODO(ra-e developer): not implemented')
}
export function filledPhotos(slots: PhotoSlots): RawImage[] {
  void slots
  throw new Error('TODO(ra-e developer): not implemented')
}
