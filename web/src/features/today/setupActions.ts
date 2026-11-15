// B9-53 (TB-06): the writes behind the first-run tile, in their own module so the tests that mock ./setupSeam keep working.
// "Looks right" and "Hide for now" PUT /api/household/settings with the whole current settings changed in one field group (the server
// keeps what a save leaves out, and marks timeZoneConfigured itself); the Member sheet POSTs /api/members (then links a User); the Meal
// Slot quick start POSTs /api/meal-slots/batch (the server makes everyone attend). Each write refreshes the facts it changes.
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { http } from '../../lib/http'
import { useToast, useUndoToast } from '../../ui'
import { setupKeys } from './setupSeam'
import { todayStrings as s } from './strings'

type Settings = Record<string, unknown> & { timeZoneConfigured?: boolean }

export interface SetupMemberInput {
  name: string
  colour: string
  avatar: string
  portionFactor: number
  email?: string | null
  photo?: string
}

export interface QuickStartSlot {
  name: string
  /** "HH:MM" */
  time: string
  /** 1 (Monday) to 7 (Sunday). */
  weekdays: number[]
}

export interface SetupActions {
  /** Saves the time zone and currency ("Looks right"). Toasts; rejects on a refusal so the step stays current. */
  confirmDeviceSettings: (values: { timeZone: string; currency: string }) => Promise<void>
  /** "Hide for now": setupHidden with an Undo toast that shows it again. */
  hide: () => Promise<void>
  /** The Member sheet's save: the Member, then its User link. Rejects with the server's words. */
  addMember: (input: SetupMemberInput, userId: number | null) => Promise<void>
  /** The quick start's Create: one batch. Rejects with the server's words. */
  createMealSlots: (slots: QuickStartSlot[]) => Promise<void>
}

/** The settings as the server has them now, without the flag only the server sets. */
async function currentSettings(read: () => Promise<Settings>): Promise<Settings> {
  const { timeZoneConfigured: _owned, ...rest } = await read()
  return rest
}

export function useSetupActions(): SetupActions {
  const queryClient = useQueryClient()
  const toast = useToast()
  const undoToast = useUndoToast()

  const read = useCallback(
    () => queryClient.fetchQuery({ queryKey: setupKeys.settings, queryFn: () => http.get<Settings>('/api/household/settings'), staleTime: 0 }),
    [queryClient],
  )

  const saveSettings = useCallback(
    async (patch: Settings) => {
      const saved = await http.put<Settings>('/api/household/settings', { ...(await currentSettings(read)), ...patch })
      if (saved && typeof saved === 'object') queryClient.setQueryData(setupKeys.settings, saved)
      await queryClient.invalidateQueries({ queryKey: setupKeys.settings })
    },
    [queryClient, read],
  )

  const setHidden = useCallback((hidden: boolean) => saveSettings({ setupHidden: hidden }), [saveSettings])

  return useMemo<SetupActions>(
    () => ({
      confirmDeviceSettings: async ({ timeZone, currency }) => {
        try {
          const { setupHidden: _kept, ...rest } = await currentSettings(read)
          const saved = await http.put<Settings>('/api/household/settings', { ...rest, timeZone, currency })
          if (saved && typeof saved === 'object') queryClient.setQueryData(setupKeys.settings, saved)
          await queryClient.invalidateQueries({ queryKey: setupKeys.settings })
        } catch (err) {
          toast.show(s.setupSaveFailed, { status: 'warning' })
          throw err
        }
        toast.show(s.setupSaved)
      },
      hide: async () => {
        try {
          await setHidden(true)
        } catch {
          toast.show(s.setupSaveFailed, { status: 'warning' })
          return
        }
        undoToast.show({ headline: s.setupHidden, subline: s.setupHiddenWhere, undoAriaLabel: s.setupUndo, undo: () => setHidden(false) })
      },
      addMember: async (input, userId) => {
        const member = await http.post<{ id: number }>('/api/members', input)
        if (userId !== null) await http.put(`/api/members/${member.id}/user`, { userId })
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: setupKeys.members }),
          queryClient.invalidateQueries({ queryKey: setupKeys.mealSlots }),
          queryClient.invalidateQueries({ queryKey: ['household'] }),
        ])
      },
      createMealSlots: async (slots) => {
        await http.post('/api/meal-slots/batch', { slots })
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: setupKeys.mealSlots }),
          queryClient.invalidateQueries({ queryKey: setupKeys.plan }),
          queryClient.invalidateQueries({ queryKey: ['household', 'meal-slots'] }),
        ])
      },
    }),
    [queryClient, read, setHidden, toast, undoToast],
  )
}
