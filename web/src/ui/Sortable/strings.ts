// The words ui/Sortable speaks (GLOSSARY wording; docs/dev/design/sort-drag.md section 4).

export interface SortableStrings {
  /** Text of the description every handle points at with aria-describedby. */
  instructions: string
  handleLabel: (label: string) => string
  liftedKeyboard: (label: string, position: number, total: number) => string
  liftedPointer: (label: string, position: number, total: number) => string
  moved: (label: string, position: number, total: number) => string
  atEdge: (label: string, edge: 'first' | 'last') => string
  dropped: (label: string, position: number, total: number) => string
  droppedUnchanged: (label: string, position: number, total: number) => string
  cancelled: (label: string, position: number, total: number) => string
}

export const sortableStrings: SortableStrings = {
  instructions: 'Press Space to pick up, the arrow keys to move, Space to drop and Escape to cancel.',
  handleLabel: (label) => `Reorder ${label}`,
  liftedKeyboard: (label, position, total) =>
    `Picked up ${label}. Position ${position} of ${total}. Use the arrow keys to move, Space to drop, Escape to cancel.`,
  liftedPointer: (label, position, total) => `Picked up ${label}. Position ${position} of ${total}.`,
  moved: (label, position, total) => `${label} moved to position ${position} of ${total}.`,
  atEdge: (label, edge) => `${label} is already ${edge}.`,
  dropped: (label, position, total) => `Dropped ${label} at position ${position} of ${total}.`,
  droppedUnchanged: (label, position, total) => `Dropped ${label}. Position unchanged, ${position} of ${total}.`,
  cancelled: (label, position, total) => `Reordering cancelled. ${label} stays at position ${position} of ${total}.`,
}
