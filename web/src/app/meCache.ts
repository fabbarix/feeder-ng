// The last successful /api/me, kept in localStorage so the shell can open offline (R10). Plain TypeScript, no React.
import type { Me } from './useMe'

export const ME_CACHE_KEY = 'feeder.me'

export function readCachedMe(): Me | null {
  throw new Error('not implemented: offline cold reload')
}

export function writeCachedMe(_me: Me): void {
  throw new Error('not implemented: offline cold reload')
}

export function clearCachedMe(): void {
  throw new Error('not implemented: offline cold reload')
}
