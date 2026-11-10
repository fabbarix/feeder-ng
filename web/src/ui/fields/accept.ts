/** Matches a file against an `accept` string like ".json,image/*,application/pdf" (extension, exact MIME, or type/*). Empty accept allows all. */
export function acceptsFile(file: { name: string; type: string }, accept: string | undefined): boolean {
  const rules = (accept ?? '')
    .split(',')
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean)
  if (rules.length === 0) return true
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return rules.some((rule) => {
    if (rule.startsWith('.')) return name.endsWith(rule)
    if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1))
    return type === rule
  })
}
