// B9-40 stub (SHORT-01, decision SHORT 3): the tap-or-scroll threshold of the Step tile's tap zones. The developer implements it.
export const TAP_SLOP_PX = 10

/** A pointer that went down at `down` and came up at `up` made a tap when it moved less than 10 px. */
export function isTap(_down: { x: number; y: number }, _up: { x: number; y: number }): boolean {
  return false
}
