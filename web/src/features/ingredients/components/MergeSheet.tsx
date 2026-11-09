export interface MergeSheetProps {
  open: boolean
  sourceId: number
  onClose: () => void
  /** Called with the surviving Ingredient's id after a successful merge. */
  onMerged: (targetId: number) => void
}

/**
 * BottomSheet "Merge Ingredient" driven by useMergeFlow. Step 1: "Find the Ingredient to keep" input and a
 * button per candidate. Step 2: strings.mergeSummary, strings.mergeMoves(total source references) when > 0,
 * the blocked message when preview.blocked is set (no confirm button then), MergeConflictList when there are
 * conflicts, and a "Merge" button disabled until canMerge.
 */
export function MergeSheet(props: MergeSheetProps) {
  void props
  return null
}
