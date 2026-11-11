// R15: per-slot anchors on /settings/meal-slots so "Choose who attends" (R13) can deep-link. STUBS (step 2).
export function slotAnchorId(_slotId: number): string {
  throw new Error('not implemented')
}
/** "#meal-slot-12" */
export function slotHash(_slotId: number): string {
  throw new Error('not implemented')
}
/** 12 from "#meal-slot-12"; null for anything else. */
export function slotIdFromHash(_hash: string): number | null {
  throw new Error('not implemented')
}
