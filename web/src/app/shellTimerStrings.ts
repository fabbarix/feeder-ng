// English strings for the shell's timer pill, finish banner and Timers sheet (PC-04). The banner's headline and subline come from
// features/cook/lib/householdTimers (bannerText), the pill's name from ui/TimerPill.strings.
export const shellTimerStrings = {
  sheetTitle: 'Timers',
  openCookMode: 'Open Cook Mode',
  dismiss: 'Dismiss',
  /** A Timers sheet row's target: "Open Cook Mode: Roast the chicken". */
  openRow: (title: string) => `Open Cook Mode: ${title}`,
  /** A Timers sheet row's time once the timer has run out. */
  finished: 'Finished',
  /** After a paused timer's time in a Timers sheet row. */
  paused: 'Paused',
  /** Names the Timers sheet's list for assistive technology. */
  listLabel: 'Household timers',
}
