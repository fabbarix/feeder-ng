// Where focus goes when a Tag leaves the list. Plain TypeScript, no React.
/**
 * The Tag whose row takes focus after `removedId` leaves: the row that takes its place (the next one), else the previous row
 * when it was last, else null (no Tag is left: Add Tag takes focus). `order` is the Tag ids by name before the change.
 */
export function focusAfterRemoval(order: readonly number[], removedId: number): number | null {
  const at = order.indexOf(removedId)
  if (at === -1) return order[0] ?? null
  if (at + 1 < order.length) return order[at + 1]!
  if (at > 0) return order[at - 1]!
  return null
}
