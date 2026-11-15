// B9-55 (int1 finding): the page-layout seed leaves the Household in UTC+14 (Etc/GMT-14), whose midnight is 10:00 UTC. A full-profile run
// that crosses it (int1's did, at 04:00 China time) changes the Household's date under the Shop scenarios: B9-34's ticked Lines leave
// the list and five scenario pages are "not inspected". It is a clock artefact, not a product bug, and it recurs for any run that
// starts within about 20 minutes before the zone's midnight.
//
// Contract (adds to pageLayoutSeedZones.ds.test.ts, which still holds): pickZones(nowMs) chooses the confirmZone so that the Household's
// local date does not change for the next 90 minutes (the guard's own timeout is 30 minutes and the heavy queue can hold a run back).
// The DS contract keeps at least 2 targets, and a confirm zone from UTC+11 to UTC+14 is the range that holds 2 targets with the plan
// zone at UTC-12 (the window is (offset + 9) h long and must exceed the 19.5 h between a Lunch and the next Breakfast but one), and the
// four midnights are an hour apart, so one of them is always more than 90 minutes away.
import { describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const mod = createRequire(resolve(cwd, 'package.json'))(resolve(cwd, '../scripts/test/fixtures/page-layout-seed-zones.mjs')) as {
  pickZones: (nowMs: number) => { planZone: string; confirmZone: string; targets: { date: string; time: string }[] }
}

/** UTC offset in hours of Etc/GMT+N (UTC-N) and Etc/GMT-N (UTC+N). */
const offsetOf = (zone: string): number => {
  const m = /^Etc\/GMT([+-])(\d{1,2})$/.exec(zone)
  return m ? (m[1] === '+' ? -1 : 1) * Number(m[2]) : Number.NaN
}
const MIN = 60e3
const HOUR = 60 * MIN
const localDate = (ms: number, offsetH: number) => new Date(ms + offsetH * HOUR).toISOString().slice(0, 10)

const nows: number[] = []
for (let h = 0; h < 24; h++) for (const m of [0, 15, 30, 45]) nows.push(Date.UTC(2026, 10, 13, h, m))
// the instants around the old zone's midnight (10:00 UTC), which int1 hit
nows.push(Date.UTC(2026, 10, 13, 9, 40), Date.UTC(2026, 10, 13, 9, 59), Date.UTC(2026, 10, 13, 10, 0), Date.UTC(2026, 10, 13, 10, 1))

describe("the seed's Household date does not change during a run (B9-55, int1 finding)", () => {
  it.each(nows.map((n) => [new Date(n).toISOString().slice(11, 16), n] as const))('at %s UTC the confirm zone keeps its date for 90 minutes', (_label, now) => {
    const { confirmZone } = mod.pickZones(now)
    const c = offsetOf(confirmZone)
    expect(Number.isNaN(c), `${confirmZone} is a fixed-offset Etc/GMT zone`).toBe(false)
    expect(localDate(now, c), `${confirmZone} changes date within 90 minutes of ${new Date(now).toISOString()}`).toBe(localDate(now + 90 * MIN, c))
  })
  it('the choice stays inside the range that still gives at least 2 targets (UTC+11 to UTC+14), at every hour', () => {
    for (const now of nows) {
      const c = offsetOf(mod.pickZones(now).confirmZone)
      expect(c).toBeGreaterThanOrEqual(11)
      expect(c).toBeLessThanOrEqual(14)
    }
  })
})
