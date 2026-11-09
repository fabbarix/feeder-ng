export interface TileArt {
  /** First letter of the name, upper-case (Unicode-aware); '?' for a blank name. */
  initial: string
  /** Icon key of the first Tag that has one, else 'dish'. */
  icon: TagIcon
  /** Accent tone index 0..TONE_COUNT-1, stable for a given name (not random). */
  tone: number
}

export const TONE_COUNT = 6

export type TagIcon = 'fish' | 'meat' | 'chicken' | 'pasta' | 'rice' | 'soup' | 'salad' | 'veg' | 'bake' | 'roast' | 'breakfast' | 'sweet' | 'dish'

/**
 * The generated illustrated tile for a Recipe without a photo: Tag icon + initial on an accent tone.
 * Tag matching is case-insensitive and by whole word ("fish" and "fish pie" -> fish); the first Tag
 * (in the Recipe's order) that maps to an icon wins.
 */
export function tileArt(_name: string, _tags: string[]): TileArt {
  throw new Error('TODO')
}
