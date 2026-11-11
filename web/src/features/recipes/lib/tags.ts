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

/** At most this many suggestions under the Tag field. */
export const MAX_TAG_SUGGESTIONS = 8

/**
 * The existing Tags to offer for what is typed: those not on the Recipe yet whose key contains the typed key, the
 * ones that start with it first, then the most used, then by name. Nothing while the field is blank.
 */
export function suggestTags<T extends { name: string; recipes: number }>(known: T[], current: string[], typed: string, limit = MAX_TAG_SUGGESTIONS): T[] {
  const q = tagKey(typed)
  if (q === '') return []
  const taken = new Set(current.map(tagKey))
  return known
    .filter((t) => !taken.has(tagKey(t.name)) && tagKey(t.name).includes(q))
    .sort((a, b) => {
      const pa = tagKey(a.name).startsWith(q) ? 0 : 1
      const pb = tagKey(b.name).startsWith(q) ? 0 : 1
      return pa - pb || b.recipes - a.recipes || a.name.localeCompare(b.name)
    })
    .slice(0, limit)
}

/** The spelling to save for a typed Tag: an existing Tag's own name when the keys match ("Pasta " -> "pasta"), so no duplicate is made. */
export function canonicalTag(known: { name: string }[], typed: string): string {
  const key = tagKey(typed)
  return known.find((t) => tagKey(t.name) === key)?.name ?? typed
}
