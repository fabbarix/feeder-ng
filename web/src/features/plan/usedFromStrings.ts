// Copy for Used from (docs/dev/design/b5-ufw.md §4). GLOSSARY words only.

export const usedFromStrings = {
  title: 'Used from',
  summaryDefault: 'Soonest to go off first',
  summaryChosen: (n: number) => `Your choice for ${n} ${n === 1 ? 'Ingredient' : 'Ingredients'}`,
  lineTitle: (ingredient: string, need: string) => `${ingredient} · ${need}`,
  lotLabel: (quantity: string, place: string) => `${quantity} · ${place}`,
  /** A Lot in no Storage Place (storagePlaceName ""). */
  unsorted: 'Not sorted',
  bought: (date: string) => `Bought ${date}`,
  amountLabel: (place: string) => `Amount used from ${place}`,
  short: (picked: string, need: string) => `${picked} of ${need} chosen. The rest follows soonest to go off first.`,
  over: (picked: string, need: string) => `${picked} chosen, more than the ${need} needed. Taken as chosen.`,
  noLots: 'No Stock of this Ingredient',
  /** `bought` (a short date) is given only when two conflicting Lots share a quantity and Storage Place. */
  conflict: (ingredient: string, quantity: string, place: string, bought?: string) =>
    `${ingredient}: the Courses together take more from the ${quantity} Lot in ${place}${bought ? ` (bought ${bought})` : ''} than it holds`,
  refused: 'Some Stock Lots changed. Check Used from and try again.',
}
