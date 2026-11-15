// English copy for the form fields (kept out of ui/strings.ts, which WP3 edits).
export const fieldStrings = {
  clearSearch: 'Clear search',
  searchPlaceholder: 'Search',
  chooseDate: 'Choose a date',
  previousMonth: 'Previous month',
  nextMonth: 'Next month',
  hour: 'Hour',
  minute: 'Minute',
  chooseFile: 'Choose a file or drop it here',
  custom: 'Custom',
  initialsGlyph: 'Aa',
  customColour: 'Custom colour',
  hue: 'Hue',
  hexColour: 'Hex colour',
  hexHint: 'Use #RGB or #RRGGBB',
  useColour: 'Use colour',
  cancel: 'Cancel',
  /** DateField rangeStart: appended to the day names of a range. */
  rangeFirstDay: ', first day',
  inRange: ', in the range',
  /** DurationField: the unit Select is named after the field. */
  durationUnit: (label: string) => `${label} unit`,
  weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
}
