import type { ToBasePlan } from './types'

// BR-D (P6, design §3.6): the confirm that names what goes when a plannable Recipe becomes a Base recipe. Pure.

export interface ConvertConfirm {
  title: string
  body: string[]
  confirmLabel: string
}

/**
 * Title "Turn Pesto into a Base recipe?", confirmLabel "Turn into a Base recipe". Body paragraphs, in order, each present only when it applies:
 * 1 always: "Pesto will stop being a plannable Recipe. A Base recipe is never planned on its own."
 * 2 Planned Meals: "These Planned Meals from today on are removed: Tue 10 Nov Dinner (Main, Pinned), ..." (the Course, then Pinned and Bought when true; dates "Tue 10 Nov", weekday from the ISO date)
 * 3 Slot Rules: "1 Slot Rule that names it is removed." / "2 Slot Rules that name it are removed."
 * 4 Leftovers: "Its 2 Leftovers stay until you answer them." (singular: "Its 1 Leftover stays until you answer it.")
 * 5 preferences > 0: "Its Favourites and Dislikes are removed."
 * 6 always last: "Cooked history stays."
 */
export function convertConfirm(name: string, plan: ToBasePlan): ConvertConfirm {
  void name; void plan
  throw new Error('BR-D: not implemented')
}
