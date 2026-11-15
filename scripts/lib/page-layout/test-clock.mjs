// fast-checks (deterministic time): the page-layout guard's test clock. The seeded Household lives in far-off time zones (the
// seed's To-confirm zones), so a run that crossed its midnight lost the Shop's ticked Lines. The guard now runs at a fixed time of
// the week instead of the hour it happens to start at:
//   the seed server and the seeder run at SEED_AT (the server through FEEDER_TEST_NOW, the seeder through this module's preload),
//   every probe server (one per unit, on a copy of the seeded database) runs at PROBE_AT, ten minutes later, and the probed pages
//   read the same time (dateShim, injected before any page script).
// The instant is Wednesday 15:00 UTC of the current week, not a fixed date: the browser keeps the session cookie by the real clock,
// and the server sets its expiry (30 days) by the test one, so the two must stay within days of each other.
const DAY = 86_400_000

/** Wednesday 15:00 UTC of the (Monday-first) week holding realMs. */
export function seedAt(realMs = Date.now()) {
  const day = Math.floor(realMs / DAY) * DAY
  const dow = (new Date(day).getUTCDay() + 6) % 7 // Monday 0
  return day - dow * DAY + 2 * DAY + 15 * 3_600_000
}
/** The probe servers' instant: ten minutes after the seed's, so everything the seed wrote is in their past. */
export const PROBE_AFTER_MS = 10 * 60_000
export const probeAt = (seedMs) => seedMs + PROBE_AFTER_MS

/**
 * Page code (an IIFE) that moves the page's Date by offsetMs: `new Date()` and `Date.now()` read the test clock; Date with
 * arguments, Date.UTC and Date.parse are unchanged. The same subclass the b9-39 setup uses for its own clock.
 */
export function dateShim(offsetMs) {
  return `(() => {
  if (globalThis.__feederTestClock) return
  const RealDate = globalThis.Date
  const offset = ${Number(offsetMs)}
  class TestDate extends RealDate {
    constructor(...args) { if (args.length === 0) super(RealDate.now() + offset); else super(...args) }
    static now() { return RealDate.now() + offset }
  }
  globalThis.Date = TestDate
  globalThis.__feederTestClock = offset
})()`
}

/** Installs the shim in this Node process (the seeder's preload: test-clock-preload.mjs). */
export function installNodeClock(atMs) {
  // eslint-disable-next-line no-new-func
  new Function(dateShim(atMs - Date.now()))()
}
