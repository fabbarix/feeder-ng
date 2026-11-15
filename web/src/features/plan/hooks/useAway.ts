// B9-46: the Away writes. TEST-AUTHOR STUB.
import type { Away, AwayPreview } from '../types'

export interface AwayWrite {
  away: Away
  changes: unknown[]
  undoToken?: string
}
export interface UseAway {
  /** `?dryRun=1`: POST /api/members/{id}/away, or PATCH /api/away/{id} when `awayId` is given. */
  preview: (memberId: number, body: Record<string, unknown>, awayId?: number) => Promise<AwayPreview>
  create: (memberId: number, body: Record<string, unknown>) => Promise<AwayWrite>
  update: (awayId: number, body: Record<string, unknown>) => Promise<AwayWrite>
  end: (awayId: number) => Promise<AwayWrite>
  remove: (awayId: number) => Promise<{ id: number; changes: unknown[]; undoToken?: string }>
  saving: boolean
}
export function useAway(): UseAway {
  throw new Error('not implemented (B9-46): useAway')
}
