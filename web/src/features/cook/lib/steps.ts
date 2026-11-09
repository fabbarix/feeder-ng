// Step navigation for Cook Mode. Plain TypeScript, no React.

export interface StepNav {
  /** 0-based index of the Step shown. */
  index: number
  /** Number of Steps in the cooking sequence. */
  total: number
}

/** Starts on the first Step. total is clamped to >= 0; with no Steps index is 0. */
export function createNav(_total: number, _index = 0): StepNav {
  throw new Error('TODO')
}

/** One Step on, stopping at the last. Returns the same object when nothing changes. */
export function goNext(_nav: StepNav): StepNav {
  throw new Error('TODO')
}

/** One Step back, stopping at the first. Returns the same object when nothing changes. */
export function goBack(_nav: StepNav): StepNav {
  throw new Error('TODO')
}

export function isFirst(_nav: StepNav): boolean {
  throw new Error('TODO')
}

/** True on the last Step, and when there are no Steps at all (Mark as Cooked is offered at once). */
export function isLast(_nav: StepNav): boolean {
  throw new Error('TODO')
}

export type TapAction = 'back' | 'next' | null

/**
 * Tablet tap zones on the step tile: the left half is Back, the right half
 * Next. x is the click's clientX; rect the tile's bounding box. Taps outside
 * the box, or on a zero-width box, do nothing (null). The exact middle is Next.
 */
export function tapAction(_x: number, _rect: { left: number; width: number }): TapAction {
  throw new Error('TODO')
}
