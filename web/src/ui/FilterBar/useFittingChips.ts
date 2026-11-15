// B9-15 (SET-06): useFittingChips lives in ui/lib (the Select panel uses it too); this path re-exports it for the FilterBar.
export { measureChipLine, useFittingChips } from '../lib/useFittingChips'
export type { ChipLineMetrics } from '../lib/useFittingChips'
