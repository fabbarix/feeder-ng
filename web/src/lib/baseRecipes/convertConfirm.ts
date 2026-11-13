import type { ToBasePlan } from './types'

// BR-D (P6, design §3.6): the confirm that names what goes when a plannable Recipe becomes a Base recipe. Pure.

export interface ConvertConfirm {
  title: string
  body: string[]
  confirmLabel: string
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-11-10" -> "Tue 10 Nov" (UTC, so no time zone shifts the day). */
function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d))
  return `${DAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`
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
  const body: string[] = [`${name} will stop being a plannable Recipe. A Base recipe is never planned on its own.`]
  if (plan.plannedMeals.length > 0) {
    const items = plan.plannedMeals.map((m) => {
      const parts = [m.courseName, ...(m.pinned ? ['Pinned'] : []), ...(m.bought ? ['Bought'] : [])]
      return `${dayLabel(m.date)} ${m.mealSlotName} (${parts.join(', ')})`
    })
    body.push(`These Planned Meals from today on are removed: ${items.join(', ')}.`)
  }
  const rules = plan.slotRules.length
  if (rules === 1) body.push('1 Slot Rule that names it is removed.')
  else if (rules > 1) body.push(`${rules} Slot Rules that name it are removed.`)
  if (plan.leftovers === 1) body.push('Its 1 Leftover stays until you answer it.')
  else if (plan.leftovers > 1) body.push(`Its ${plan.leftovers} Leftovers stay until you answer them.`)
  if (plan.preferences > 0) body.push('Its Favourites and Dislikes are removed.')
  body.push('Cooked history stays.')
  return { title: `Turn ${name} into a Base recipe?`, body, confirmLabel: 'Turn into a Base recipe' }
}
