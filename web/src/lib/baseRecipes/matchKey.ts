// BR-D: the name key of docs/dev/design/base-recipes.md §4.5 (units.NormalizeName): trimmed, whitespace collapsed, lower case, accents folded, one trailing plural "s" dropped.

/** "  Béchamels " -> "bechamel". Used to rank and compare names; never shown. */
export function referenceKey(name: string): string {
  const folded = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  return folded.length > 1 && folded.endsWith('s') ? folded.slice(0, -1) : folded
}

/** The display form of a typed or Ingredient name: trimmed, whitespace collapsed, first letter upper case ("béchamel" -> "Béchamel"). */
export function displayBaseName(name: string): string {
  const clean = name.trim().replace(/\s+/g, ' ')
  if (clean === '') return ''
  return clean.charAt(0).toLocaleUpperCase() + clean.slice(1)
}
