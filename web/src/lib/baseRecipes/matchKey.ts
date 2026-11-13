// BR-D: the name key of docs/dev/design/base-recipes.md §4.5 (units.NormalizeName): trimmed, whitespace collapsed, lower case, accents folded, one trailing plural "s" dropped.

/** "  Béchamels " -> "bechamel". Used to rank and compare names; never shown. */
export function referenceKey(name: string): string {
  void name
  throw new Error('BR-D: not implemented')
}

/** The display form of a typed or Ingredient name: trimmed, whitespace collapsed, first letter upper case ("béchamel" -> "Béchamel"). */
export function displayBaseName(name: string): string {
  void name
  throw new Error('BR-D: not implemented')
}
