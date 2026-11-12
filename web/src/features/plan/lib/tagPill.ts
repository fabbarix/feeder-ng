import type { Tag } from '../../../lib/tags'

/** What a rule row draws for a Tag: the label and, when the Tag is known, its colour id (spec 4.1). */
export interface TagPill {
  label: string
  /** Absent when no Tag has that key (deleted, or the Tags have not loaded): the pill is neutral. */
  colour?: string
}

/** TG-PW stub: rules name a Tag by key; the developer looks it up by `tagKey` and falls back to the text given, neutral. */
export function tagPill(_tags: readonly Tag[], keyOrName: string): TagPill {
  return { label: keyOrName }
}
