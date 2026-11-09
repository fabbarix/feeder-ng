/** The matching key of a Tag, as the server computes it: lower case, trimmed, whitespace collapsed. */
export function tagKey(name: string): string {
  return name.trim().split(/\s+/).join(' ').toLowerCase()
}
