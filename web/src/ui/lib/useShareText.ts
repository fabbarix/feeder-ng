// B9-52 (SET-03): STUB for the test author's commit; the developer implements it (see useShareText.test.tsx).
export type ShareOutcome = 'shared' | 'cancelled' | 'failed'

/** The device's share sheet, only through the Share item that asks for it. */
export function useShareText(_probe: ShareData): { canShare: boolean; share: (data: ShareData) => Promise<ShareOutcome> } {
  throw new Error('useShareText: not implemented')
}
