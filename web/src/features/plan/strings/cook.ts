// English UI strings of the planning feature: Mark as Cooked, the Stock correction and the route that opens a slot's Mark as Cooked sheet. Glossary terms only. Re-exported by ../strings.ts as part of planStrings.
export const cookStrings = {
  // Mark as Cooked sheet
  cookedTitle: 'Mark as Cooked',
  cookedQuestion: 'How many portions are left over?',
  leftoverLabel: 'Leftover portions',
  leftoverUseBy: (weekday: string) => `Use by ${weekday}`,
  noLeftover: 'No Leftover',
  confirmCooked: 'Mark as Cooked',
  cookedError: 'That could not be saved. Nothing was changed.',
  fromLeftoverNote: 'Served from a Leftover. Nothing is taken from Stock.',
  yield: (batches: string, portions: string) => `${batches} yields ${portions}`,
  needed: (portions: string) => `${portions} needed`,
  // B5-F1: the route that opens a slot's Mark as Cooked / Mark all Cooked sheet (the Shopping List hint's "Mark it")
  markSlot: {
    nothingLeft: 'Nothing is left to mark Cooked there.',
  },
} as const
