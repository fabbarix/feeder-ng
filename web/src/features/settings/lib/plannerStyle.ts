import { settingsStrings } from '../strings'

const anchors = settingsStrings.plannerStyleAnchor

export const PLANNER_ANCHORS = [
  { position: 0, label: anchors.useWhatWeHave },
  { position: 0.5, label: anchors.variety },
  { position: 1, label: anchors.favourites },
] as const

/** An anchor's label at an anchor, otherwise "Between <a> and <b>". */
export function plannerStyleLabel(position: number): string {
  const exact = PLANNER_ANCHORS.find((a) => a.position === position)
  if (exact) return exact.label
  const upper = PLANNER_ANCHORS.findIndex((a) => a.position > position)
  const hi = upper < 0 ? PLANNER_ANCHORS.length - 1 : upper
  const lo = Math.max(0, hi - 1)
  return settingsStrings.plannerStyleBetween(PLANNER_ANCHORS[lo]!.label, PLANNER_ANCHORS[hi]!.label)
}

/** Clamp to 0..1, round to 2 decimals, and snap to an anchor when within 0.04 of it. */
export function snapPlannerStyle(position: number): number {
  const clamped = Math.min(1, Math.max(0, position))
  const rounded = Math.round(clamped * 100) / 100
  for (const a of PLANNER_ANCHORS) {
    if (Math.abs(rounded - a.position) <= 0.04 + 1e-9) return a.position
  }
  return rounded
}
