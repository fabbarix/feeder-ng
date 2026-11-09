// Continuous scanning reads the same barcode on every frame; this lets one read through per window.
// Plain TypeScript. Stubs until implemented.

export interface Cooldown {
  /** true when the code should be handled now; the same code inside the window is refused, any other code is accepted */
  accept(code: string): boolean
  reset(): void
}

export function createCooldown(windowMs: number, now: () => number = () => Date.now()): Cooldown {
  void windowMs
  void now
  throw new Error('not implemented')
}
