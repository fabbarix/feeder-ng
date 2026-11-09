export const PLANNER_ANCHORS = [
  { position: 0, label: 'Use what we have' },
  { position: 0.5, label: 'Variety' },
  { position: 1, label: 'Favourites' },
] as const

/** An anchor's label at an anchor, otherwise "Between <a> and <b>". */
export function plannerStyleLabel(_position: number): string {
  throw new Error('not implemented')
}

/** Clamp to 0..1, round to 2 decimals, and snap to an anchor when within 0.04 of it. */
export function snapPlannerStyle(_position: number): number {
  throw new Error('not implemented')
}
