// Where focus goes when a Tag leaves the list. Plain TypeScript, no React.

/**
 * The Tag whose row takes focus after `removedId` leaves: the row that takes its place (the next one), else the previous row
 * when it was last, else null (no Tag is left: Add Tag takes focus). `order` is the Tag ids by name before the change.
 */
export function focusAfterRemoval(_order: readonly number[], _removedId: number): number | null {
  throw new Error('TG-S: not implemented')
}
