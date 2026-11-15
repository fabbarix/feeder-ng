/** CRS E2: Courses and Whole meal in the editor, chips, filter and the confirm before a Course is taken off. */
export const courseStrings = {
  label: 'Courses',
  wholeMeal: 'Whole meal',
  wholeMealHelper: (main: string) => `Planned as ${main}, it leaves the slot's other Courses empty`,
  wholeMealChip: 'Whole meal',
  chipsLabel: 'Courses',
  filterLabel: 'Filter by Course',
  lossTitle: (names: string, rules: number) => `Taking ${names} off removes ${rules === 1 ? 'a Slot Rule' : `${rules} Slot Rules`}`,
  lossBody: 'These Slot Rules name this Recipe on a Course it will no longer fill.',
  lossRulesHeading: 'Slot Rules',
  lossConfirm: 'Save and remove',
  lossCancel: 'Cancel',
} as const
