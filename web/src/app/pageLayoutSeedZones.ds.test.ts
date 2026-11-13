// DS-A round 3: the page-layout seed leaves at least 2 Meal Slots on a date to confirm at ANY hour. The round-2 trick (plan in
// Pacific/Pago_Pago, confirm in Pacific/Kiritimati, Dinner only) had a dead hour: at 19:00 Pago Pago (06:00 UTC) toConfirm was 0,
// and the Today reviewer saw no To confirm rows until it switched to Etc/GMT+12 by hand.
//
// Contract for the developer:
//   scripts/test/fixtures/page-layout-seed-zones.mjs exports
//     SLOT_TIMES: the seed's daily Meal Slot times, ['08:30', '13:00', '19:00'] (Breakfast, Lunch, Dinner every day: the largest
//                 gap is 13.5 h, so any window of about 23 h holds at least two of them);
//     pickZones(nowMs) -> { planZone, confirmZone, targets: [{ date: 'YYYY-MM-DD', time: 'HH:MM' }, ...] }
//       planZone / confirmZone: fixed-offset IANA zones ('Etc/GMT+12' is UTC-12 ... 'Etc/GMT-14' is UTC+14);
//       targets: the slot instances (local date and time) to plan while the Household is in planZone (each at least 15 min ahead
//       there) that are more than 2 h 15 min past once it is in confirmZone. At least 2, for every nowMs.
//   page-layout-seed.mjs imports pickZones, creates Breakfast, Lunch and Dinner every day, and plans exactly those targets.
import { describe, expect, it } from 'vitest'

const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const nodeFs = 'node:fs'
const { readFileSync, existsSync } = (await import(/* @vite-ignore */ nodeFs)) as {
  readFileSync: (p: string, enc: string) => string
  existsSync: (p: string) => boolean
}
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const zonesPath = resolve(cwd, '../scripts/test/fixtures/page-layout-seed-zones.mjs')
const seed = readFileSync(resolve(cwd, '../scripts/test/fixtures/page-layout-seed.mjs'), 'utf8')

type Picked = { planZone: string; confirmZone: string; targets: { date: string; time: string }[] }
const mod = existsSync(zonesPath)
  ? ((await import(/* @vite-ignore */ zonesPath)) as { SLOT_TIMES: string[]; pickZones: (nowMs: number) => Picked })
  : null

/** UTC offset in hours of a fixed-offset zone name; NaN for anything else. Etc/GMT signs are inverted (Etc/GMT+12 = UTC-12). */
const offsetOf = (zone: string): number => {
  const m = /^Etc\/GMT([+-])(\d{1,2})$/.exec(zone)
  if (m) return (m[1] === '+' ? -1 : 1) * Number(m[2])
  if (zone === 'Etc/UTC' || zone === 'Etc/GMT') return 0
  return Number.NaN
}
/** The absolute instant (ms) of a local date and time in a zone with this offset. */
const instant = (date: string, time: string, offsetH: number) => Date.parse(`${date}T${time}:00Z`) - offsetH * 3600e3

const MIN = 60e3
const nows: number[] = []
for (let h = 0; h < 24; h++) for (const m of [0, 15, 30, 45]) nows.push(Date.UTC(2026, 10, 13, h, m))
nows.push(Date.UTC(2026, 10, 13, 6, 0)) // the dead hour of round 2: 19:00 in Pago Pago

describe('page-layout seed: To confirm at any hour', () => {
  it('scripts/test/fixtures/page-layout-seed-zones.mjs exists and exports SLOT_TIMES and pickZones', () => {
    expect(mod).not.toBeNull()
    expect(mod?.SLOT_TIMES).toEqual(['08:30', '13:00', '19:00'])
    expect(typeof mod?.pickZones).toBe('function')
  })

  it.each(nows.map((n) => [new Date(n).toISOString().slice(11, 16), n] as const))('at %s UTC: at least 2 targets, each plannable then confirmable', (_label, now) => {
    const picked = mod!.pickZones(now)
    const plan = offsetOf(picked.planZone)
    const confirm = offsetOf(picked.confirmZone)
    expect(Number.isNaN(plan), `planZone ${picked.planZone} must be a fixed-offset Etc/GMT zone`).toBe(false)
    expect(Number.isNaN(confirm), `confirmZone ${picked.confirmZone} must be a fixed-offset Etc/GMT zone`).toBe(false)
    expect(plan).toBeGreaterThanOrEqual(-12)
    expect(confirm).toBeLessThanOrEqual(14)
    expect(picked.targets.length).toBeGreaterThanOrEqual(2)
    for (const t of picked.targets) {
      expect(mod!.SLOT_TIMES).toContain(t.time)
      // planned while the Household is in planZone: the slot is still ahead there
      expect(instant(t.date, t.time, plan) - now, `${t.date} ${t.time} must be >= 15 min ahead in ${picked.planZone}`).toBeGreaterThanOrEqual(15 * MIN)
      // confirmable once it is in confirmZone: more than 2 h 15 min past there (To confirm is 2 h after the slot)
      expect(now - instant(t.date, t.time, confirm), `${t.date} ${t.time} must be > 2 h 15 min past in ${picked.confirmZone}`).toBeGreaterThan(135 * MIN)
    }
  })

  it('the seed uses pickZones and serves Breakfast, Lunch and Dinner every day (no weekend-only slots)', () => {
    expect(seed).toMatch(/page-layout-seed-zones\.mjs/)
    expect(seed).toMatch(/pickZones\(/)
    expect(seed).not.toMatch(/Pacific\/Pago_Pago|Pacific\/Kiritimati/)
    expect(seed).not.toMatch(/if \(d >= 6\)/)
  })
})
