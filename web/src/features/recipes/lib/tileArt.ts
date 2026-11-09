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

/** Whole words of a Tag that choose an icon. */
const ICON_WORDS: Record<string, TagIcon> = {
  fish: 'fish',
  meat: 'meat',
  beef: 'meat',
  pork: 'meat',
  chicken: 'chicken',
  pasta: 'pasta',
  rice: 'rice',
  soup: 'soup',
  salad: 'salad',
  veg: 'veg',
  vegetables: 'veg',
  bake: 'bake',
  roast: 'roast',
  breakfast: 'breakfast',
  sweet: 'sweet',
  dessert: 'sweet',
}

/**
 * The generated illustrated tile for a Recipe without a photo: Tag icon + initial on an accent tone.
 * Tag matching is case-insensitive and by whole word ("fish" and "fish pie" -> fish); the first Tag
 * (in the Recipe's order) that maps to an icon wins.
 */
export function tileArt(name: string, tags: string[]): TileArt {
  const trimmed = name.trim()
  const initial = trimmed === '' ? '?' : [...trimmed][0]!.toUpperCase()
  let icon: TagIcon = 'dish'
  for (const tag of tags) {
    const found = tag
      .toLowerCase()
      .split(/\s+/)
      .map((word) => ICON_WORDS[word])
      .find((i): i is TagIcon => i !== undefined)
    if (found) {
      icon = found
      break
    }
  }
  return { initial, icon, tone: toneOf(name) }
}

/** A stable hash of the name, folded to a tone index. */
function toneOf(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return h % TONE_COUNT
}
