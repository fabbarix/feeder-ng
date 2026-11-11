export type ThumbSize = 40 | 48 | 72 | 'hero'

export interface ThumbProps {
  /** "/api/images/<id>" of an Ingredient's or a Product's Picture; absent or "" draws the empty reserved slot. */
  imageUrl?: string
  size?: ThumbSize
  /** When given it is the image's alt text; otherwise the thumb is decorative (the name is shown next to it). */
  label?: string
}

/**
 * STUB (PE step 1, docs/dev/design/pe-pictures-everywhere.md): the shared Picture thumb. The Developer implements it
 * (+ Thumb.css) and moves features/products PictureThumb and IngredientList's local slot onto it.
 */
export function Thumb(_props: ThumbProps) {
  return null
}
