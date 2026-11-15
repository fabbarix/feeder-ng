// The page-layout seed's To confirm zones (DS-A round 3, contract in web/src/app/pageLayoutSeedZones.ds.test.ts).
// The seed has no clock to move, so it moves the Household's time zone: it plans slot instances while the Household is in
// planZone, then switches to confirmZone, where those slots are more than 2 h 15 min past and wait to be confirmed.
//
// Every day has three Meal Slots (Breakfast, Lunch, Dinner). The planZone is Etc/GMT+12 (UTC-12), the confirmZone is Etc/GMT-14
// (UTC+14) or, near its midnight, UTC+13, +12 or +11 (B9-55): the same wall-clock slot is 23 to 26 h later there. pickZones(nowMs) returns the local slot instances that can still be
// planned (at least 30 min ahead in planZone) and are past To-confirm (more than 2 h 30 min past in confirmZone). That window is
// 23 h long, so it always holds at least two of the three daily slots, at any hour.

export const SLOT_TIMES = ['08:30', '13:00', '19:00']

const MIN = 60e3
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const PLAN_ZONE = 'Etc/GMT+12'
const PLAN_OFFSET_H = -12
// B9-55 (int1 finding): the confirm zone is the first of UTC+14, +13, +12, +11 whose local date stays the same for the next 90 minutes,
// so a run never crosses the Household's midnight. The four midnights are an hour apart, so one is always more than 90 minutes away;
// from UTC+11 up the window (offset + 9 h) still holds at least two of the three daily slots.
const CONFIRM_OFFSETS_H = [14, 13, 12, 11]
const KEEP_DATE = 90 * MIN
const localDay = (ms, offsetH) => Math.floor((ms + offsetH * HOUR) / DAY)
const confirmOffset = (nowMs) => CONFIRM_OFFSETS_H.find((o) => localDay(nowMs, o) === localDay(nowMs + KEEP_DATE, o)) ?? CONFIRM_OFFSETS_H[0]
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
  const confirm = confirmOffset(nowMs)
  const hi = nowMs - PAST_MIN + confirm * HOUR
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
  return { planZone: PLAN_ZONE, confirmZone: `Etc/GMT-${confirm}`, targets }
}
