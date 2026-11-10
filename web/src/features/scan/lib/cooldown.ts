// Continuous scanning reads the same barcode on every frame; this lets one read through per window.
// Plain TypeScript.

export interface Cooldown {
  /** true when the code should be handled now; the same code inside the window is refused, any other code is accepted */
  accept(code: string): boolean
  reset(): void
}

export function createCooldown(windowMs: number, now: () => number = () => Date.now()): Cooldown {
  let last: { code: string; at: number } | null = null
  return {
    accept(code) {
      const t = now()
      if (last && last.code === code && t - last.at < windowMs) return false
      last = { code, at: t }
      return true
    },
    reset() {
      last = null
    },
  }
}
