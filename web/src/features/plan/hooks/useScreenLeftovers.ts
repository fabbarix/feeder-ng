// Round 2: the Leftover logic Today's screen held inline: the Leftover flow, the tile's rows, visibility and tone, picking a
// frozen Leftover for the Course the chooser is open for, and the "From" link. Components only wire it.
import { asLeftover } from '../lib/leftovers'
import { tileRows } from '../../../lib/leftovers/rows'
import type { Leftover } from '../../../lib/leftovers/types'
import { useLeftoverFlow, type LeftoverFlow } from '../../../lib/leftovers/useLeftoverFlow'
import type { Leftover as PlanLeftover, SlotKey } from '../types'
import { usePickLeftover } from './usePickLeftover'

export interface ScreenLeftoversInput {
  /** Household date. */
  today: string
  /** The plan's Leftovers (may predate the beta.5 fields). */
  leftovers: PlanLeftover[]
  /** The chooser: the Course it is open for (null = closed) and how to close it. */
  choose: { key: SlotKey | null; close: () => void }
  /** Closes the Planned Meal sheet (the From link replaces it). */
  closePlanned: () => void
}

export interface ScreenLeftovers {
  flow: LeftoverFlow
  tile: { visible: boolean; tone: 'info' | 'leftover'; leftovers: Leftover[] }
  /** The frozen Leftovers the chooser's "From the freezer" lists (it filters them). */
  chooserLeftovers: Leftover[]
  pickLeftover: (leftoverId: number) => Promise<void>
  openLeftover: (leftoverId: number) => void
}

export function useScreenLeftovers({ today, leftovers, choose, closePlanned }: ScreenLeftoversInput): ScreenLeftovers {
  const flow = useLeftoverFlow(today)
  const pick = usePickLeftover()
  const full: Leftover[] = leftovers.map(asLeftover)
  return {
    flow,
    tile: {
      visible: tileRows(full, today).length > 0,
      tone: full.some((l) => l.toAnswer) ? 'info' : 'leftover',
      leftovers: full,
    },
    chooserLeftovers: flow.leftovers.filter((l) => l.frozen),
    pickLeftover: async (leftoverId) => {
      const found = flow.leftovers.find((l) => l.id === leftoverId)
      const key = choose.key
      if (!key || !found) return
      choose.close()
      await pick(key, found)
    },
    openLeftover: (leftoverId) => {
      closePlanned()
      flow.openDetails(leftoverId)
    },
  }
}
