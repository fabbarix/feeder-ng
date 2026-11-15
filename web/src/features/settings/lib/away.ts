// B9-46 (SET-16): Away on the Members list and in the Member sheet. Plain TypeScript.
// TEST-AUTHOR STUB: throws until the developer builds it (away.test.ts pins it).
import type { Away, AwaySlotRef } from '../../plan/types'

const todo = (name: string): never => {
  throw new Error(`not implemented (B9-46): ${name}`)
}

/** The Members list's meta line (info tone): "Away 20–27 Nov", "Away until Sun 16 Nov", "Away from Tue 1 Dec", "… · +1 more"; null when none is current or coming. */
export const awayMeta = (_aways: Away[], _today: string): string | null => todo('awayMeta')

export interface AwayRowModel {
  /** "Thu 19 – Thu 26 Nov", "From Tue 1 Dec". */
  title: string
  /** "in 4 days", "today", "now" (running). */
  state: string
  /** "24 Meal Slots · whole days", "From Dinner · 22 Meal Slots", "No last day yet". */
  detail: string
}
export const awayRow = (_away: Away, _today: string, _slots: AwaySlotRef[]): AwayRowModel => todo('awayRow')
/** The row's accessible name: "Away Thu 19 – Thu 26 Nov, in 4 days, 24 Meal Slots · whole days". */
export const awayRowName = (_row: AwayRowModel): string => todo('awayRowName')
