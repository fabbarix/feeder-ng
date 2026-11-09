// Motion preferences. Plain TypeScript, no React.

export const MAX_MOTION_MS = 250

type MatchMediaHost = Partial<Pick<Window, 'matchMedia'>>

/** True when the user asks for reduced motion. False when matchMedia is unavailable. */
export function prefersReducedMotion(win: MatchMediaHost | undefined = globalThis.window): boolean {
  const query = win?.matchMedia?.('(prefers-reduced-motion: reduce)')
  return query?.matches ?? false
}

/** 0 when motion is reduced; otherwise the requested duration capped at 250 ms. */
export function motionDuration(ms: number, win: MatchMediaHost | undefined = globalThis.window): number {
  return prefersReducedMotion(win) ? 0 : Math.min(ms, MAX_MOTION_MS)
}
