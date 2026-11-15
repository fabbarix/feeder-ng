// B9-10: features/settings/strings.ts is split into strings/{members,household,slots,allowlist,preferences,courses,hub}.ts and keeps
// re-exporting settingsStrings (88 files import it), so later packages edit only their area module. Contract as for the Recipes split.
import { describe, expect, it } from 'vitest'
import { readSource } from '../plan/test-css'
import { coursesStrings } from './coursesStrings'
import { settingsStrings } from './strings'
import { settingsAllowlistStrings } from './strings/allowlist'
import { coursesStrings as coursesFromModule } from './strings/courses'
import { settingsHouseholdStrings } from './strings/household'
import { settingsHubStrings } from './strings/hub'
import { settingsMembersStrings } from './strings/members'
import { settingsPreferencesStrings } from './strings/preferences'
import { settingsSlotsStrings } from './strings/slots'

// The top-level keys of settingsStrings at the start of B9-10.
const KEYS = [
  'invalidEmail', 'title', 'household', 'members', 'mealSlots', 'allowlist', 'allowlistAdminOnly', 'preferences', 'index', 'loading', 'loadError',
  'householdSaved', 'preferencesSaved', 'attendanceSaved', 'attendanceReset', 'slotStarted', 'form', 'plannerStyle', 'plannerStyleAnchor',
  'plannerStyleBetween', 'member', 'slot', 'attendance', 'allowlistPanel', 'prefs',
  // B9-20 (RES-02): the LoadState of a Settings list.
  'offline',
]
// `courses` holds the Courses page strings, which are not keys of settingsStrings (coursesStrings is its own object).
const parts = {
  members: settingsMembersStrings,
  household: settingsHouseholdStrings,
  slots: settingsSlotsStrings,
  allowlist: settingsAllowlistStrings,
  preferences: settingsPreferencesStrings,
  hub: settingsHubStrings,
} as Record<string, Record<string, unknown>>
const all = settingsStrings as unknown as Record<string, unknown>

describe('settings strings split', () => {
  it('settingsStrings still has every key it had', () => {
    expect(Object.keys(all).sort()).toEqual([...KEYS].sort())
  })
  it('the six modules each hold keys, and no key is in two of them', () => {
    const seen = new Map<string, string>()
    for (const [name, part] of Object.entries(parts)) {
      expect(Object.keys(part).length, name).toBeGreaterThan(0)
      for (const k of Object.keys(part)) {
        expect(seen.get(k), `${k} is in ${seen.get(k)} and ${name}`).toBeUndefined()
        seen.set(k, name)
      }
    }
  })
  it('together they are settingsStrings: same keys, same values', () => {
    const union: Record<string, unknown> = Object.assign({}, ...Object.values(parts))
    expect(Object.keys(union).sort()).toEqual([...KEYS].sort())
    for (const k of KEYS) expect(all[k], k).toBe(union[k])
  })
  it('each area keeps what it is about', () => {
    expect(parts.members).toHaveProperty('member')
    expect(parts.slots).toHaveProperty('slot')
    expect(parts.slots).toHaveProperty('attendance')
    expect(parts.allowlist).toHaveProperty('allowlistPanel')
    expect(parts.preferences).toHaveProperty('prefs')
    expect(parts.hub).toHaveProperty('index')
  })
  it('the courses module is the Courses page strings, the same object coursesStrings.ts exports', () => {
    expect(coursesFromModule).toBe(coursesStrings)
  })
  it('strings.ts is a thin file (no string bodies)', () => {
    expect(readSource('features/settings/strings.ts').split('\n').length).toBeLessThanOrEqual(40)
  })
})
