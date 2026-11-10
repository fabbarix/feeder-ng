// English UI strings for Today. Glossary terms only.
export const todayStrings = {
  title: 'Today',
  gridLabel: 'Today',
  loading: 'Loading',
  emptyTitle: 'Nothing on the menu. The kitchen is yours.',
  emptyHint: 'No Planned Meals to cook, no Leftovers waiting, nothing about to spoil. Put your feet up or plan something tasty.',
  emptyAction: 'Open the Plan',
  actionFailed: 'That did not save. Try again.',
  advanceStepsHeading: 'Advance Steps',
  advanceStepDue: (slotTime: string) => `Now, for ${slotTime}`,
  advanceStepUpcoming: (dueTime: string, slotTime: string) => `At ${dueTime}, for ${slotTime}`,
  useSoonHeading: 'Use soon',
  streakHeading: 'Zero-waste streak',
  streakLabel: 'zero-waste streak',
  whenToday: 'today',
  whenTomorrow: 'tomorrow',
  useSoonMore: (n: number) => `+${n} more`,
}
