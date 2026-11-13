import { useQuery } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { importApi } from '../api'
import { alsoExports, type CallGraph } from '../lib/exportAlso'
import { exportHref, selectAllIds, toggleId } from '../lib/exportSelection'
import type { ExportableRecipe } from '../types'

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
  also?: Array<{ id: number; name: string }>
}

/**
 * BR-E: the Base recipes the selected Recipes call for, transitively, read from GET /api/recipes/{id} one Recipe at a time (a Recipe read
 * once; a Base recipe found through a Recipe is read too). A failed read leaves the list empty; the download itself is never blocked.
 */
async function callsOfSelection(selected: number[]): Promise<Array<{ id: number; name: string }>> {
  const graph: CallGraph = {}
  const pending = [...selected]
  while (pending.length > 0) {
    const id = pending.shift()!
    if (id in graph) continue
    graph[id] = await importApi.recipeCalls(id)
    for (const call of graph[id]!.calls) if (!(call.id in graph)) pending.push(call.id)
  }
  return alsoExports(selected, graph)
}

/** Recipes (query key ['recipes', 'export']) and the selection state for the Export picker. */
export function useExportPicker(): UseExportPicker {
  const query = useQuery({ queryKey: ['recipes', 'export'], queryFn: () => importApi.recipes() })
  const recipes = query.data ?? []
  const ids = recipes.map((r) => r.id)
  const [selected, setSelected] = useState<number[]>([])
  const also = useQuery({
    queryKey: ['recipes', 'export-also', ...selected],
    queryFn: () => callsOfSelection(selected),
    enabled: selected.length > 0,
    retry: false,
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
