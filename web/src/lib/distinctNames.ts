// B9-55 (A11Y-08, P38): two items of one list that share a name (two Recipes both called "Slow cooker beef and barley stew") must
// not share an accessible name. Plain TypeScript, no React.

/**
 * The accessible name of each item by id: its name, or, when another item of the list has the same name, the name and what tells
 * them apart: the item's `fact` when the facts of that name all differ ("…, 3 h 30 min"), else its place among them ("…, 2 of 2").
 */
export function distinctNames<T extends { id: number; name: string }>(items: readonly T[], fact: (item: T) => string | undefined = () => undefined): Map<number, string> {
  const byName = new Map<string, T[]>()
  for (const item of items) byName.set(item.name, [...(byName.get(item.name) ?? []), item])
  const out = new Map<number, string>()
  for (const [name, group] of byName) {
    if (group.length === 1) {
      out.set(group[0]!.id, name)
      continue
    }
    const facts = group.map((item) => fact(item)?.trim() ?? '')
    const useFacts = facts.every(Boolean) && new Set(facts).size === facts.length
    group.forEach((item, i) => out.set(item.id, `${name}, ${useFacts ? facts[i] : `${i + 1} of ${group.length}`}`))
  }
  return out
}
