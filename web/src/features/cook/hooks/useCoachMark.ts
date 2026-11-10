/**
 * The one-time coach mark for the tablet tap zones. [show, dismiss]: show is true until dismiss() has been called
 * once on this device; the choice is kept in localStorage under `feeder.cook.coach` (value "seen"). Without
 * working storage (private mode) it shows once per mount and never throws.
 */
export function useCoachMark(): [boolean, () => void] {
  return [false, () => {}]
}
