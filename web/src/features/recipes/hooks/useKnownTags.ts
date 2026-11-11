// The Household's existing Tags with their Recipe counts (GET /api/tags), for the Tag field's suggestions. React hook.
import { useQuery } from '@tanstack/react-query'
import { recipesApi } from '../api'
import type { TagCount } from '../types'

export function useKnownTags(): TagCount[] {
  const query = useQuery({ queryKey: ['tags'], queryFn: recipesApi.tags })
  return query.data ?? []
}
