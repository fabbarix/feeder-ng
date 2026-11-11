// R15: per-slot anchors on /settings/meal-slots so "Choose who attends" (R13) can deep-link.
const PREFIX = 'meal-slot-'

export function slotAnchorId(slotId: number): string {
  return `${PREFIX}${slotId}`
}
/** "#meal-slot-12" */
export function slotHash(slotId: number): string {
  return `#${slotAnchorId(slotId)}`
}
/** 12 from "#meal-slot-12"; null for anything else. */
export function slotIdFromHash(hash: string): number | null {
  const m = /^#meal-slot-(\d+)$/.exec(hash)
  return m ? Number(m[1]) : null
}
