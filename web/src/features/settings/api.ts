// Typed calls for the household, allowlist and preference endpoints.
import { http } from '../../lib/http'
import type { RemovedMealSlotGroup } from './lib/removedMealSlots'
import type { MealSlotImpact } from './lib/slotRemoval'
import type {
  AllowedUser,
  AttendanceEntry,
  DateAttendance,
  DateCourseChange,
  HouseholdSettings,
  MealSlot,
  MealSlotInput,
  PlanDateSlot,
  SlotBatchRequest,
  SlotBatchResult,
  Member,
  MemberInput,
  Preferences,
  SettingsInput,
} from './types'
import type { MemberImpact } from './lib/memberRemoval'

export const settingsApi = {
  getSettings: () => http.get<HouseholdSettings>('/api/household/settings'),
  saveSettings: (body: SettingsInput) => http.put<HouseholdSettings>('/api/household/settings', body),
  listMembers: () => http.get<Member[]>('/api/members'),
  createMember: (body: MemberInput) => http.post<Member>('/api/members', body),
  updateMember: (id: number, body: MemberInput) => http.patch<Member>(`/api/members/${id}`, body),
  deleteMember: (id: number) => http.delete<void>(`/api/members/${id}`),
  linkMemberUser: (id: number, userId: number | null) => http.put<Member>(`/api/members/${id}/user`, { userId }),
  listMealSlots: () => http.get<MealSlot[]>('/api/meal-slots'),
  createMealSlot: (body: MealSlotInput) => http.post<MealSlot>('/api/meal-slots', body),
  updateMealSlot: (id: number, body: MealSlotInput) => http.patch<MealSlot>(`/api/meal-slots/${id}`, body),
  batchUpdateMealSlots: (body: SlotBatchRequest) => http.patch<SlotBatchResult>('/api/meal-slots/batch', body),
  /** SAFE-02: what removing this Meal Slot takes away (Planned Meals, Slot Rules, To confirm) and the Cooked meals it keeps. */
  mealSlotImpact: (id: number) => http.get<MealSlotImpact>(`/api/meal-slots/${id}/impact`),
  /** SAFE-02 / B9-42: a soft removal (the Cooked history stays) of one or several Meal Slots in one call, all or nothing (204); 404 `not_found` or 409 `meal_slot_removed` name the id. */
  removeMealSlots: (ids: number[]) => http.post<void>('/api/meal-slots/remove', { ids }),
  /** B9-42: one Undo or Put back for several Meal Slots, all or nothing; 409 `meal_slot_name_taken` names the days. */
  restoreMealSlots: (ids: number[]) => http.post<{ slots: MealSlot[] }>('/api/meal-slots/restore', { ids }),
  /** SET-15: the removed Meal Slots that kept Cooked history, one row per name removed at once, newest first. */
  listRemovedMealSlots: () => http.get<RemovedMealSlotGroup[]>('/api/meal-slots?removed=with-history'),
  getAttendance: (slotId: number, date: string) =>
    http.get<DateAttendance>(`/api/meal-slots/${slotId}/attendance?date=${date}`),
  /**
   * CRS D2: `attendance` is left out of the body when undefined (only the Courses change); `courses` is sent when given.
   * B5-F1: `guests` (0 to 20) is sent when given, 0 included (taking the Guests off).
   */
  saveAttendance: (slotId: number, date: string, attendance: AttendanceEntry[] | undefined, courses?: DateCourseChange[], guests?: number) =>
    http.put<DateAttendance>(`/api/meal-slots/${slotId}/attendance?date=${date}`, {
      ...(attendance !== undefined ? { attendance } : {}),
      ...(courses !== undefined ? { courses } : {}),
      ...(guests !== undefined ? { guests } : {}),
    }),
  resetAttendance: (slotId: number, date: string) =>
    http.delete<void>(`/api/meal-slots/${slotId}/attendance?date=${date}`),
  /** B5-F1: the plan's slots, for "Dates that differ" (time, Not served and Guests of the upcoming dates). */
  planDates: () => http.get<{ slots: PlanDateSlot[] }>('/api/plan'),
  listAllowlist: () => http.get<AllowedUser[]>('/api/allowlist'),
  addAllowedUser: (body: { email: string; displayName?: string; isAdmin?: boolean }) =>
    http.post<AllowedUser>('/api/allowlist', body),
  setAdmin: (id: number, isAdmin: boolean) => http.patch<AllowedUser>(`/api/allowlist/${id}`, { isAdmin }),
  removeAllowedUser: (id: number) => http.delete<void>(`/api/allowlist/${id}`),
  getPreferences: () => http.get<Preferences>('/api/me/preferences'),
  savePreferences: (body: Preferences) => http.put<Preferences>('/api/me/preferences', body),

  // B9-36 (SAFE-02, B9-04's routes): what goes with a Member before Remove, and Undo of a removal (restore by id, 10 min).
  memberImpact: (id: number) => http.get<MemberImpact>(`/api/members/${id}/impact`),
  restoreMember: (id: number) => http.post<Member>(`/api/members/${id}/restore`),
}
