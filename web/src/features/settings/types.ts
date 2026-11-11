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
  /** The optional Member email (A1): with it the Member's person can sign in without asking. */
  email: string | null
  /** IM2: the photo's image id, '' = none. The server always sends it (optional here so older fixtures compile). The avatar shows photo, else emoji, else initials. */
  photo?: string
  /** IM2: '/api/images/<photo>' or ''. */
  photoUrl?: string
}

export interface MemberInput {
  name: string
  colour: string
  avatar: string
  portionFactor: number
  /** In the editor draft: the typed text ('' = none). On the wire (POST/PATCH /api/members): the trimmed address, or null. */
  email: string | null
  /** IM2: image id of the photo. Sent only when there is one (a PATCH replaces the Member, so leaving it out removes the photo). */
  photo?: string
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
  units: 'metric' | 'imperial'
}
