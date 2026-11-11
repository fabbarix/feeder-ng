// Typed calls for the household, allowlist and preference endpoints.
import { http } from '../../lib/http'
import type {
  AllowedUser,
  AttendanceEntry,
  DateAttendance,
  HouseholdSettings,
  MealSlot,
  MealSlotInput,
  SlotBatchRequest,
  SlotBatchResult,
  Member,
  MemberInput,
  Preferences,
  SettingsInput,
} from './types'

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
  deleteMealSlot: (id: number) => http.delete<void>(`/api/meal-slots/${id}`),
  getAttendance: (slotId: number, date: string) =>
    http.get<DateAttendance>(`/api/meal-slots/${slotId}/attendance?date=${date}`),
  saveAttendance: (slotId: number, date: string, attendance: AttendanceEntry[]) =>
    http.put<DateAttendance>(`/api/meal-slots/${slotId}/attendance?date=${date}`, { attendance }),
  resetAttendance: (slotId: number, date: string) =>
    http.delete<void>(`/api/meal-slots/${slotId}/attendance?date=${date}`),
  listAllowlist: () => http.get<AllowedUser[]>('/api/allowlist'),
  addAllowedUser: (body: { email: string; displayName?: string; isAdmin?: boolean }) =>
    http.post<AllowedUser>('/api/allowlist', body),
  setAdmin: (id: number, isAdmin: boolean) => http.patch<AllowedUser>(`/api/allowlist/${id}`, { isAdmin }),
  removeAllowedUser: (id: number) => http.delete<void>(`/api/allowlist/${id}`),
  getPreferences: () => http.get<Preferences>('/api/me/preferences'),
  savePreferences: (body: Preferences) => http.put<Preferences>('/api/me/preferences', body),
}
