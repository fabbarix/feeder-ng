// Shapes of the household and preference API (docs/dev/design/t1-auth-household.md).
export type HouseholdLocation = { city: string } | { latitude: number; longitude: number }

export interface HouseholdSettings {
  timeZone: string
  timeZoneConfigured: boolean
  planningHorizonDays: number
  defaultCooldownDays: number
  defaultLeftoverUseByDays: number
  /** B5-LOW: the Household's Frozen Use-by, whole days 1 to 365 (the default for a frozen Leftover; a Recipe may override it). Absent in older payloads (90 then). */
  frozenUseByDays?: number
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

/** CRS D2: one Course a Meal Slot serves, in the slot's order (`optOutMemberIds`: the usual opt-outs, spec 3.1). */
export interface SlotCourse {
  id: number
  name: string
  main: boolean
  optional: boolean
  optOutMemberIds: number[]
}

/** What a Meal Slot save sends for a Course: its id, the Optional flag and the usual opt-outs. */
export interface SlotCourseInput {
  id: number
  optional: boolean
  optOutMemberIds: number[]
}

export interface MealSlot {
  id: number
  /** ISO weekday: 1 Monday .. 7 Sunday. */
  weekday: number
  name: string
  time: string
  attendance: AttendanceEntry[]
  portionsNeeded: number
  /** CRS D2: the Courses the slot serves, in its order. The server always sends it; optional here so older fixtures compile (absent = none shown). */
  courses?: SlotCourse[]
}

export interface MealSlotInput {
  weekday: number
  name: string
  time: string
  attendance: AttendanceEntry[]
  /** CRS D2: in the slot's order. Absent: the main Course on create, unchanged on update. */
  courses?: SlotCourseInput[]
}

/** CRS D2: a Course's effective Attendance on one date (`isOverride`: that date has its own opt-outs for it). */
export interface DateCourse {
  courseId: number
  name: string
  optOutMemberIds: number[]
  isOverride: boolean
  attendance: AttendanceEntry[]
  portionsNeeded: number
}

/** CRS D2: what a Date Attendance save says about one Course: a list sets its opt-outs for the date, null drops them (back to usual). */
export interface DateCourseChange {
  courseId: number
  optOutMemberIds: number[] | null
}

export interface DateAttendance {
  slotId: number
  date: string
  isOverride: boolean
  attendance: AttendanceEntry[]
  portionsNeeded: number
  /** CRS D2: one per Course of the slot, in its order (always sent by the server; absent in older fixtures). */
  courses?: DateCourse[]
  /** B5-F1 (ADR 0014): Guests eating that date, 0 to 20 (absent in older fixtures = 0). `portionsNeeded` includes them. */
  guests?: number
}

/** B5-F1: the slice of GET /api/plan "Dates that differ" reads: a slot on a date with its effective and usual time, Not served and Guests. */
export interface PlanDateSlot {
  date: string
  mealSlotId: number
  name: string
  time: string
  usualTime?: string
  notServed?: boolean
  guests?: number
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

/** R15: PATCH /api/meal-slots/batch. Edits the Meal Slot named `match` on each weekday; only the fields in `set` change. */
export interface SlotBatchChange {
  name?: string
  time?: string
  /** Replaces the usual Attendance on every matching Meal Slot; [] means nobody. */
  attendance?: AttendanceEntry[]
  /** CRS D2: the Courses of each matching slot, in order, with Optional and opt-outs. Only when the Admin changed them. */
  courses?: SlotCourseInput[]
}
export interface SlotBatchRequest {
  match: string
  weekdays: number[]
  set: SlotBatchChange
  /** CRS D2: answer the same shape plus `removes` without writing (the editor's preview). */
  dryRun?: boolean
}

/** CRS D2: a Planned Meal a Meal Slot change takes away (Pinned ones first in the answer). */
export interface RemovedMeal {
  date: string
  mealSlotId: number
  mealSlotName: string
  courseId: number
  courseName: string
  recipeId: number
  recipeName: string
  pinned: boolean
}
/** CRS D2: a Slot Rule a Meal Slot change takes away (a Recipe or a Tag). */
export interface RemovedRule {
  id: number
  mealSlotId: number
  mealSlotName: string
  courseId: number
  courseName: string
  recipeId?: number
  recipeName?: string
  tag?: string
}
export interface SlotRemoves {
  plannedMeals: RemovedMeal[]
  slotRules: RemovedRule[]
}
export interface SlotBatchResult {
  match: string
  updated: MealSlot[]
  skipped: { weekday: number; reason: 'no_slot' }[]
  /** CRS D2: what the change removes (always sent by the server; absent in older fixtures). */
  removes?: SlotRemoves
}
