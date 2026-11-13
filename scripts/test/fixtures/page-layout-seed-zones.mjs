// The page-layout seed's To confirm zones (DS-A round 3, contract in web/src/app/pageLayoutSeedZones.ds.test.ts).
// The seed has no clock to move, so it moves the Household's time zone: it plans slot instances while the Household is in
// planZone, then switches to confirmZone, where those slots are more than 2 h 15 min past and wait to be confirmed.
//
// Every day has three Meal Slots (Breakfast, Lunch, Dinner). The planZone is Etc/GMT+12 (UTC-12), the confirmZone is Etc/GMT-14
// (UTC+14): the same wall-clock slot is 26 h later there. pickZones(nowMs) returns the local slot instances that can still be
// planned (at least 30 min ahead in planZone) and are past To-confirm (more than 2 h 30 min past in confirmZone). That window is
// 23 h long, so it always holds at least two of the three daily slots, at any hour.

export const SLOT_TIMES = ['08:30', '13:00', '19:00']

const MIN = 60e3
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const PLAN_ZONE = 'Etc/GMT+12'
const CONFIRM_ZONE = 'Etc/GMT-14'
const PLAN_OFFSET_H = -12
const CONFIRM_OFFSET_H = 14
// margins: the slot is at least 30 min ahead when planned, and more than 2 h 30 min past when confirmed (To confirm starts at 2 h)
const AHEAD_MIN = 30 * MIN
const PAST_MIN = 150 * MIN

/**
 * The zones and the slot instances to plan for a wall clock at nowMs.
 * targets: { date: 'YYYY-MM-DD', time: 'HH:MM' } in planZone, each one a SLOT_TIMES entry.
 */
export function pickZones(nowMs) {
  // a slot with local wall-clock time L (ms, read as UTC) is at L - offset in absolute time
  // absolute instant = L - offset*HOUR, so L = instant + offset*HOUR
  // plannable (planZone):    L >= now + AHEAD + PLAN_OFFSET_H*HOUR
  // confirmable (confirmZone): L <= now - PAST + CONFIRM_OFFSET_H*HOUR
  const lo = nowMs + AHEAD_MIN + PLAN_OFFSET_H * HOUR
  const hi = nowMs - PAST_MIN + CONFIRM_OFFSET_H * HOUR
  const targets = []
  const firstDay = Math.floor(lo / DAY) * DAY - DAY
  const lastDay = Math.floor(hi / DAY) * DAY + DAY
  for (let day = firstDay; day <= lastDay; day += DAY) {
    for (const time of SLOT_TIMES) {
      const [h, m] = time.split(':').map(Number)
      const local = day + h * HOUR + m * MIN
      if (local >= lo && local <= hi) targets.push({ date: new Date(day).toISOString().slice(0, 10), time })
    }
  }
  return { planZone: PLAN_ZONE, confirmZone: CONFIRM_ZONE, targets }
}
