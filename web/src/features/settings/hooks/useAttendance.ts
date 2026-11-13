import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsApi } from '../api'
import type { AttendanceEntry, DateAttendance, DateCourseChange } from '../types'
import { settingsKeys } from './queryKeys'

export interface AttendanceState {
  attendance: DateAttendance | undefined
  isPending: boolean
  isError: boolean
  /** PUT this date's Attendance and/or its Courses' opt-outs (undefined attendance: Courses only); also refreshes Meal Slots. */
  save: (attendance: AttendanceEntry[] | undefined, courses?: DateCourseChange[], guests?: number) => Promise<DateAttendance>
  /** DELETE the override for this date. */
  reset: () => Promise<void>
  saving: boolean
}

/** Does nothing (no request) while slotId or date is null. */
export function useAttendance(slotId: number | null, date: string | null): AttendanceState {
  const queryClient = useQueryClient()
  const enabled = slotId !== null && date !== null
  const query = useQuery({
    queryKey: settingsKeys.attendance(slotId ?? 0, date ?? ''),
    queryFn: () => settingsApi.getAttendance(slotId!, date!),
    enabled,
  })
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: settingsKeys.attendance(slotId ?? 0, date ?? '') }),
      queryClient.invalidateQueries({ queryKey: settingsKeys.slots }),
    ])
  }
  const save = useMutation({
    mutationFn: ({ attendance, courses, guests }: { attendance: AttendanceEntry[] | undefined; courses?: DateCourseChange[]; guests?: number }) =>
      settingsApi.saveAttendance(slotId!, date!, attendance, courses, guests),
    onSuccess: refresh,
  })
  const reset = useMutation({ mutationFn: () => settingsApi.resetAttendance(slotId!, date!), onSuccess: refresh })
  return {
    attendance: query.data,
    isPending: enabled && query.isPending,
    isError: query.isError,
    save: (attendance, courses, guests) => save.mutateAsync({ attendance, courses, guests }),
    reset: () => reset.mutateAsync(),
    saving: save.isPending || reset.isPending,
  }
}
