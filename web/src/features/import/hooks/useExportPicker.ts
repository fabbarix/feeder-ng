import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { importApi } from '../api'
import { alsoExports, type CallGraph } from '../lib/exportAlso'
import { exportHref, selectAllIds, toggleId } from '../lib/exportSelection'
import type { ExportableRecipe } from '../types'

/** How long a Recipe's Base recipe calls are trusted: ticking and unticking reads nothing again within it. */
const CALLS_STALE_MS = 10 * 60 * 1000

export interface UseExportPicker {
  recipes: ExportableRecipe[]
  isLoading: boolean
  error: Error | null
  selected: number[]
  toggle: (id: number) => void
  selectAll: () => void
  clear: () => void
  /** Download address (lib/exportSelection.exportHref) or null when nothing is selected. */
  href: string | null
  /** BR-E: the Base recipes the export adds beyond the selection ("Also exports"); [] while none is selected or the look-up fails. */
  also: Array<{ id: number; name: string }>
}

/**
 * BR-E: the Base recipes the selected Recipes call for, transitively. Each Recipe's calls are cached under ['recipes', id, 'calls'], and each
 * level of the walk is read in parallel: the selection first, then the Base recipes they call for, and so on. A Recipe already read is not read
 * again. A failed read leaves the list empty; the download itself is never blocked.
 */
async function callsOfSelection(client: QueryClient, selected: number[]): Promise<Array<{ id: number; name: string }>> {
  const graph: CallGraph = {}
  let level = [...new Set(selected)]
  while (level.length > 0) {
    const reads = await Promise.all(
      level.map((id) =>
        client.fetchQuery({
          queryKey: ['recipes', id, 'calls'],
          queryFn: () => importApi.recipeCalls(id),
          staleTime: CALLS_STALE_MS,
        }),
      ),
    )
    level.forEach((id, i) => {
      graph[id] = reads[i]!
    })
    const next: number[] = []
    for (const id of level) {
      for (const call of graph[id]!.calls) {
        if (!(call.id in graph) && !next.includes(call.id)) next.push(call.id)
      }
    }
    level = next
  }
  return alsoExports(selected, graph)
}

/** Recipes (query key ['recipes', 'export']) and the selection state for the Export picker. */
export function useExportPicker(): UseExportPicker {
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['recipes', 'export'], queryFn: () => importApi.recipes() })
  const recipes = query.data ?? []
  const ids = recipes.map((r) => r.id)
  const [selected, setSelected] = useState<number[]>([])
  const also = useQuery({
    queryKey: ['recipes', 'export-also', ...selected],
    queryFn: () => callsOfSelection(client, selected),
    enabled: selected.length > 0,
    retry: false,
    // While a new selection is read, the list of the previous one stays.
    placeholderData: keepPreviousData,
  })

  const toggle = useCallback((id: number) => setSelected((s) => toggleId(s, id)), [])
  const selectAll = useCallback(() => setSelected(selectAllIds(ids)), [ids])
  const clear = useCallback(() => setSelected([]), [])

  return {
    recipes,
    isLoading: query.isLoading,
    error: query.error,
    selected,
    toggle,
    selectAll,
    clear,
    href: exportHref(ids, selected),
    also: selected.length > 0 ? (also.data ?? []) : [],
  }
}
