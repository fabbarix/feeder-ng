// Checking a Tag name before it is sent (spec 4.1). Plain TypeScript, no React.
import { tagKey, type Tag } from '../../../lib/tags'
import { tagsStrings } from '../strings'

export const MAX_TAG_NAME = 40

export type TagNameCheck =
  | { ok: true; name: string }
  | { ok: false; reason: 'empty' | 'too_long'; message: string }
  | { ok: false; reason: 'taken'; message: string; other: Tag }

/** Trim and collapse inner whitespace; the case is kept. */
export function normaliseTagName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

/**
 * Empty, then longer than 40 characters, then taken: another Tag (not `ownId`) has the same tagKey. The Tag's own key is not
 * taken, so "fish" to "Fish" is fine.
 */
export function checkTagName(raw: string, tags: readonly Tag[], ownId?: number): TagNameCheck {
  const name = normaliseTagName(raw)
  if (name === '') return { ok: false, reason: 'empty', message: tagsStrings.errors.empty }
  if ([...name].length > MAX_TAG_NAME) return { ok: false, reason: 'too_long', message: tagsStrings.errors.tooLong }
  const key = tagKey(name)
  const other = tags.find((t) => t.id !== ownId && t.key === key)
  if (other) return { ok: false, reason: 'taken', message: tagsStrings.errors.taken(other.name), other }
  return { ok: true, name }
}
