import { tagKey } from '../../../lib/tags/keys'
import type { Tag } from '../../../lib/tags'

/** What a rule row draws for a Tag: the label and, when the Tag is known, its colour id (spec 4.1). */
export interface TagPill {
  label: string
  /** Absent when no Tag has that key (deleted, or the Tags have not loaded): the pill is neutral. */
  colour?: string
}

/** The Tag a rule names: looked up by `tagKey` of the text given (case and inner spaces do not matter). */
export function findTag(tags: readonly Tag[], keyOrName: string): Tag | undefined {
  const key = tagKey(keyOrName)
  return tags.find((t) => t.key === key)
}

/** TG-PW: a rule names a Tag by key; the pill takes the Tag's name and colour by that key, and is neutral for a Tag that is gone. */
export function tagPill(tags: readonly Tag[], keyOrName: string): TagPill {
  const tag = findTag(tags, keyOrName)
  return tag ? { label: tag.name, colour: tag.colour } : { label: keyOrName }
}
