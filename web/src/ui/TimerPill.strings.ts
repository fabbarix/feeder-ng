// English strings for ui/TimerPill (B9-17, PC-04). The pill's accessible name says the timer, its time and how many others run.
const others = (more: number) => (more > 0 ? `, and ${more} more` : '')

export const timerPillStrings = {
  /** "Timer: Roast the chicken, 18:42, and 1 more. Open Cook Mode" */
  open: (label: string, time: string, more: number) => `Timer: ${label}, ${time}${others(more)}. Open Cook Mode`,
  /** "Timer finished: Roast the chicken, and 1 more. Open Cook Mode" */
  openFinished: (label: string, more: number) => `Timer finished: ${label}${others(more)}. Open Cook Mode`,
  /** B9-40: Cook Mode's pill opens the timer's own sheet, not Cook Mode: "Timer: Roast the chicken, 18:42. Show options" */
  openOptions: (label: string, time: string, more: number) => `Timer: ${label}, ${time}${others(more)}. Show options`,
  openOptionsFinished: (label: string, more: number) => `Timer finished: ${label}${others(more)}. Show options`,
  /** shown in place of the time once the timer has run out */
  finished: 'finished',
  /** B9-40: the "+N" button of Cook Mode's landscape strip: "1 more timer. Show all timers". */
  showAll: (more: number) => `${more} more ${more === 1 ? 'timer' : 'timers'}. Show all timers`,
  pause: (label: string) => `Pause ${label}`,
  resume: (label: string) => `Resume ${label}`,
}
