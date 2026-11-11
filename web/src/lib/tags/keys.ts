// tagKey: the same rule as Go's tag.NameKey (spec 4.1): trim, collapse inner whitespace, lower-case. Accents count.

export function tagKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}
