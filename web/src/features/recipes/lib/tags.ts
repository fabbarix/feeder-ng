import { tagKey } from './keys'

/** Adds a Tag typed by the User: trimmed, inner spaces collapsed, ignored when blank or already present (by tagKey). */
export function addTag(tags: string[], typed: string): string[] {
  const name = typed.trim().split(/\s+/).join(' ')
  if (name === '' || tags.some((t) => tagKey(t) === tagKey(name))) return tags
  return [...tags, name]
}

/** Removes the Tag with the same tagKey. */
export function removeTag(tags: string[], name: string): string[] {
  return tags.filter((t) => tagKey(t) !== tagKey(name))
}
