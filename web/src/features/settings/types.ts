// Shapes of the household and preference API (docs/dev/design/t1-auth-household.md).
export type HouseholdLocation = { city: string } | { latitude: number; longitude: number }

export interface HouseholdSettings {
  timeZone: string
  timeZoneConfigured: boolean
  planningHorizonDays: number
  defaultCooldownDays: number
  defaultLeftoverUseByDays: number
  quietHours: { start: string; end: string }
  /** 0 = Use what we have, 0.5 = Variety, 1 = Favourites. */
  plannerStyle: number
  location: HouseholdLocation | null
  currency: string
}

/** What the Admin sends: the settings without the server-owned flag. */
export type SettingsInput = Omit<HouseholdSettings, 'timeZoneConfigured'>

export interface Member {
  id: number
  name: string
  colour: string
  avatar: string
  portionFactor: number
  userId: number | null
}

export interface MemberInput {
  name: string
  colour: string
  avatar: string
  portionFactor: number
}

export interface AttendanceEntry {
  memberId: number
  /** null = use the Member's default Portion Factor. */
  portionFactorOverride: number | null
}

export interface MealSlot {
  id: number
  /** ISO weekday: 1 Monday .. 7 Sunday. */
  weekday: number
  name: string
  time: string
  attendance: AttendanceEntry[]
  portionsNeeded: number
}

export interface MealSlotInput {
  weekday: number
  name: string
  time: string
  attendance: AttendanceEntry[]
}

export interface DateAttendance {
  slotId: number
  date: string
  isOverride: boolean
  attendance: AttendanceEntry[]
  portionsNeeded: number
}

export interface AllowedUser {
  id: number
  email: string
  displayName: string
  isAdmin: boolean
}

export type ColourMode = 'light' | 'dark' | 'system'

export interface Preferences {
  scheme: ColourMode
  accent: string
  secondary: string | null
  units: 'metric' | 'imperial'
}
