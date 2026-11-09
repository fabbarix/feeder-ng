import { useState } from 'react'
import { useMe } from '../../../app/useMe'
import { useToast } from '../../../ui'
import { errorMessage } from '../lib/errors'
import { nextDateForWeekday, todayIso } from '../lib/weekdays'
import { browserTimeZone, needsTimeZoneSetup } from '../lib/timezone'
import { settingsStrings } from '../strings'
import type { AttendanceEntry, MealSlot, MealSlotInput, Member, MemberInput, Preferences, SettingsInput } from '../types'
import { useAllowlist } from './useAllowlist'
import { useAttendance } from './useAttendance'
import { useHouseholdLiveUpdates } from './useHouseholdLiveUpdates'
import { useHouseholdSettings } from './useHouseholdSettings'
import { useMealSlots } from './useMealSlots'
import { useMembers } from './useMembers'
import { usePreferences } from './usePreferences'

/** An open editor sheet: adding (no item) or editing (an item). */
interface EditorState<T> {
  item?: T
}

/** Everything the Settings screen needs: data, who may edit, open sheets, and the actions that wire them. */
export function useSettingsPage() {
  useHouseholdLiveUpdates()
  const toast = useToast()
  const me = useMe()
  const isAdmin = Boolean(me.data?.isAdmin)
  const household = useHouseholdSettings()
  const members = useMembers()
  const slots = useMealSlots()
  const allowlist = useAllowlist(isAdmin)
  const preferences = usePreferences()

  const [memberEditor, setMemberEditor] = useState<EditorState<Member> | null>(null)
  const [slotEditor, setSlotEditor] = useState<EditorState<MealSlot> | null>(null)
  const [dateEditor, setDateEditor] = useState<{ slot: MealSlot; date: string } | null>(null)
  const [memberError, setMemberError] = useState<string>()
  const [slotError, setSlotError] = useState<string>()
  const [allowlistError, setAllowlistError] = useState<string>()
  const attendance = useAttendance(dateEditor?.slot.id ?? null, dateEditor?.date ?? null)

  const suggestedTimeZone =
    household.settings && needsTimeZoneSetup(household.settings, isAdmin) ? browserTimeZone() : undefined

  const saveHousehold = async (input: SettingsInput) => {
    try {
      await household.save(input)
      toast.show(settingsStrings.householdSaved)
    } catch (err) {
      toast.show(errorMessage(err))
    }
  }

  const savePreferences = async (next: Preferences) => {
    try {
      await preferences.save(next)
      toast.show(settingsStrings.preferencesSaved)
    } catch (err) {
      toast.show(errorMessage(err))
    }
  }

  const saveMember = async (input: MemberInput, userId: number | null) => {
    const editing = memberEditor?.item
    try {
      const saved = editing ? await members.update(editing.id, input) : await members.create(input)
      if (userId !== (editing?.userId ?? null)) await members.linkUser(saved.id, userId)
      setMemberError(undefined)
      setMemberEditor(null)
    } catch (err) {
      setMemberError(errorMessage(err))
    }
  }

  const removeMember = async () => {
    const editing = memberEditor?.item
    if (!editing) return
    try {
      await members.remove(editing.id)
      setMemberError(undefined)
      setMemberEditor(null)
    } catch (err) {
      setMemberError(errorMessage(err))
    }
  }

  const saveSlot = async (input: MealSlotInput) => {
    const editing = slotEditor?.item
    try {
      if (editing) await slots.update(editing.id, input)
      else await slots.create(input)
      setSlotError(undefined)
      setSlotEditor(null)
    } catch (err) {
      setSlotError(errorMessage(err))
    }
  }

  const removeSlot = async () => {
    const editing = slotEditor?.item
    if (!editing) return
    try {
      await slots.remove(editing.id)
      setSlotError(undefined)
      setSlotEditor(null)
    } catch (err) {
      setSlotError(errorMessage(err))
    }
  }

  const saveDate = async (entries: AttendanceEntry[]) => {
    try {
      await attendance.save(entries)
      toast.show(settingsStrings.attendanceSaved)
      setDateEditor(null)
    } catch (err) {
      toast.show(errorMessage(err))
    }
  }

  const resetDate = async () => {
    try {
      await attendance.reset()
      toast.show(settingsStrings.attendanceReset)
      setDateEditor(null)
    } catch (err) {
      toast.show(errorMessage(err))
    }
  }

  const guardAllowlist = async <T,>(action: () => Promise<T>): Promise<T> => {
    try {
      const result = await action()
      setAllowlistError(undefined)
      return result
    } catch (err) {
      setAllowlistError(errorMessage(err))
      throw err
    }
  }

  const swallow = (p: Promise<unknown>) => void p.catch(() => {})

  return {
    isAdmin,
    currentUserId: me.data?.id ?? 0,
    suggestedTimeZone,
    household,
    members,
    slots,
    allowlist,
    preferences,
    attendance,
    saveHousehold,
    savePreferences,
    linkedUserNames: Object.fromEntries(allowlist.users.map((u) => [u.id, u.displayName])) as Record<number, string>,
    member: {
      editor: memberEditor,
      error: memberError,
      add: () => (setMemberError(undefined), setMemberEditor({})),
      edit: (item: Member) => (setMemberError(undefined), setMemberEditor({ item })),
      close: () => setMemberEditor(null),
      save: saveMember,
      remove: removeMember,
    },
    slot: {
      editor: slotEditor,
      error: slotError,
      add: () => (setSlotError(undefined), setSlotEditor({})),
      edit: (item: MealSlot) => (setSlotError(undefined), setSlotEditor({ item })),
      close: () => setSlotEditor(null),
      save: saveSlot,
      remove: removeSlot,
    },
    date: {
      editor: dateEditor,
      open: (slot: MealSlot) => setDateEditor({ slot, date: nextDateForWeekday(slot.weekday, todayIso()) }),
      changeDate: (date: string) => setDateEditor((d) => (d ? { ...d, date } : d)),
      close: () => setDateEditor(null),
      save: saveDate,
      reset: resetDate,
    },
    allowlistActions: {
      error: allowlistError,
      add: (email: string) => guardAllowlist(() => allowlist.add(email)),
      setAdmin: (id: number, makeAdmin: boolean) => swallow(guardAllowlist(() => allowlist.setAdmin(id, makeAdmin))),
      remove: (id: number) => swallow(guardAllowlist(() => allowlist.remove(id))),
    },
  }
}
