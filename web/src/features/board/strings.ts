// English UI strings for the kitchen board (glossary words only).
export const boardStrings = {
  /** B9-47 (TB-08): the hero with no Planned Meal ahead (no "tonight": the eyebrow carries the day). */
  heroNone: 'Nothing planned',
  /** The hero's eyebrow when there is no hero (the day word alone). */
  today: 'Today',
  /** B5-F1: a Meal Slot Not served on its date ("Dinner · Not served"). */
  notServed: 'Not served',
  nextAdvance: 'Next Advance Step',
  nextAdvanceNone: 'Nothing to prepare ahead',
  overdue: 'Overdue',
  markDone: 'Done',
  /** B9-47 (P38): Done's accessible name, "Done: <Step text>"; with its day and Meal Slot when two Steps read the same. */
  markDoneName: (step: string) => `Done: ${step}`,
  markDoneNameWithSlot: (step: string, slot: string) => `Done: ${step}, ${slot}`,
  leftovers: 'Leftovers',
  leftoversNone: 'No Leftovers',
  /** B5-LOW: a Leftover past its Use-by, still to answer on Today; read-only here. */
  useByPassed: 'Use-by passed',
  useSoon: 'Use soon',
  useSoonNone: 'Nothing to use up',
  timers: 'Timers',
  timersNone: 'No timers running',
  /** Under a list that shows fewer rows than it has (the first 2 timers, or the rows that fit a wall tile). */
  more: (n: number) => `+${n} more`,
  tomorrow: 'Tomorrow',
  notPlanned: 'Not planned',
  tomorrowNone: 'Nothing planned tomorrow',
  streak: 'Zero-waste streak',
  streakDays: (n: number) => (n === 1 ? '1 day' : `${n} days`),
  cook: 'Cook',
  /** B9-47 (P38): Cook's accessible name names the slot, "Cook Dinner". */
  cookName: (slot: string) => `Cook ${slot}`,
  /** B9-47 (TB-08): the line under the hero's Courses, "Start 13:00 · ready 19:00". */
  startLine: (start: string, ready: string) => `Start ${start} · ready ${ready}`,
  /** A11Y-01 (B9-19): the document title of /board, which has no PageHeader ("Kitchen board · Feeder"). */
  documentTitle: 'Kitchen board',
  loading: 'Loading the kitchen board',
  loadError: 'The kitchen board could not be loaded',
  due: (when: string) => `Start ${when}`,
  /** B9-47 (TB-04): the board's way out. */
  close: 'Close kitchen board',
  /** B9-47: the hero's list of Courses. */
  courses: 'Courses',
  /** B9-47 (TB-08): Today's Leftover meta, "Use by Tue". */
  useBy: (when: string) => `Use by ${when}`,
  /** B9-47 (TB-08): the Use soon chip's accessible name, "Flour, good until tomorrow". */
  goodUntil: (name: string, when: string) => `${name}, good until ${when}`,
  dayToday: 'today',
  dayTomorrow: 'tomorrow',
  /** RES-09: the names of the hero and the clock in a crashed tile's notice ("Planned Meal couldn’t be shown."). */
  heroTile: 'Planned Meal',
  clockTile: 'Clock',
  /** RES-09: "The rest of the Kitchen board is fine." */
  boundaryScope: 'the Kitchen board',
  portions: (n: number) => (n === 1 ? '1 portion' : `${n} portions`),
} as const
