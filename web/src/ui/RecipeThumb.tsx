export type RecipeThumbSize = 40 | 48 | 72 | 'hero'

export interface RecipeThumbProps {
  /** Recipe name: source of the initial of the generated tile, and of `label`. */
  name: string
  photoUrl?: string
  /** Tags in order; the first one picks the icon of the generated tile (lib/tagIcon). */
  tags?: readonly string[]
  size?: RecipeThumbSize
  /** When given the thumb is an img with this accessible name; otherwise it is decorative (the name is shown next to it). */
  label?: string
}

/**
 * STUB (WP3 designer). A photo (`object-fit: cover`) or, without a photo or when it fails to load, the generated tile:
 * soft fill, Tag icon at 40 % in accent-text, and the initial. Generated tiles carry data-generated and data-tag-icon.
 */
export function RecipeThumb(_props: RecipeThumbProps): never {
  throw new Error('not implemented')
}
