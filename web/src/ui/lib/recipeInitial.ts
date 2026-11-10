/** First letter of a Recipe name, upper-cased (first code point, so "élan" gives "É"); "?" when the name is blank. */
export function recipeInitial(name: string): string {
  const first = Array.from(name.trim())[0]
  return first ? first.toLocaleUpperCase() : '?'
}
