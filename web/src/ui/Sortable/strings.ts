// The words ui/Sortable speaks (GLOSSARY wording; docs/dev/design/sort-drag.md section 4). STUB: the developer fills them in.

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
  instructions: '',
  handleLabel: () => '',
  liftedKeyboard: () => '',
  liftedPointer: () => '',
  moved: () => '',
  atEdge: () => '',
  dropped: () => '',
  droppedUnchanged: () => '',
  cancelled: () => '',
}
