// Copy for Used from (docs/dev/design/b5-ufw.md §4). GLOSSARY words only.

export const usedFromStrings = {
  title: 'Used from',
  summaryDefault: 'Soonest to go off first',
  summaryChosen: (n: number) => `Your choice for ${n} ${n === 1 ? 'Ingredient' : 'Ingredients'}`,
  lineTitle: (ingredient: string, need: string) => `${ingredient} · ${need}`,
  lotLabel: (quantity: string, place: string) => `${quantity} · ${place}`,
  goesOff: (date: string) => `Good until ${date}`,
  noGoOff: 'No go-off date',
  bought: (date: string) => `Bought ${date}`,
  amountLabel: (place: string) => `Amount used from ${place}`,
  short: (picked: string, need: string) => `${picked} of ${need} chosen. The rest follows soonest to go off first.`,
  over: (picked: string, need: string) => `${picked} chosen, more than the ${need} needed. Taken as chosen.`,
  noLots: 'No Stock of this Ingredient',
  conflict: (ingredient: string, place: string) => `${ingredient}: the Courses together take more from the Lot in ${place} than it holds`,
  refused: 'Some Stock Lots changed. Check Used from and try again.',
}
