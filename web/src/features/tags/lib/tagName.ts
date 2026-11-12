// Checking a Tag name before it is sent (spec 4.1). Plain TypeScript, no React.
import type { Tag } from '../../../lib/tags'

export const MAX_TAG_NAME = 40

export type TagNameCheck =
  | { ok: true; name: string }
  | { ok: false; reason: 'empty' | 'too_long'; message: string }
  | { ok: false; reason: 'taken'; message: string; other: Tag }

/** Trim and collapse inner whitespace; the case is kept. */
export function normaliseTagName(_raw: string): string {
  throw new Error('TG-S: not implemented')
}

/**
 * Empty, then longer than 40 characters, then taken: another Tag (not `ownId`) has the same tagKey. The Tag's own key is not
 * taken, so "fish" to "Fish" is fine.
 */
export function checkTagName(_raw: string, _tags: readonly Tag[], _ownId?: number): TagNameCheck {
  throw new Error('TG-S: not implemented')
}
