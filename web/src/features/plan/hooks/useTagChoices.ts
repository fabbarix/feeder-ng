import { useQuery } from '@tanstack/react-query'
import { planApi } from '../api'
import type { TagChoice } from '../types'

const NONE: TagChoice[] = []

/** The existing Tags (GET /api/tags, read-only use of the recipes API) for the Tag selects; idle while not enabled. */
export function useTagChoices(enabled = true): { tags: TagChoice[]; isLoading: boolean } {
  const q = useQuery({ queryKey: ['plan', 'tags'], queryFn: planApi.tags, enabled })
  return { tags: q.data ?? NONE, isLoading: enabled && q.isLoading }
}
