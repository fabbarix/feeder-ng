import { useQuery } from '@tanstack/react-query'
import { accessApi } from '../api'
import type { AccessEvent } from '../types'
import { accessKeys } from './queryKeys'

const NONE: AccessEvent[] = []

/** The recent audit trail (newest first). */
export function useAccessHistory(): { events: AccessEvent[]; isPending: boolean } {
  const query = useQuery({ queryKey: accessKeys.history, queryFn: accessApi.history, select: (h) => h.events })
  return { events: query.data ?? NONE, isPending: query.isPending }
}
