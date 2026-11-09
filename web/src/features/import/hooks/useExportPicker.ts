import { useQuery } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { importApi } from '../api'
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
}

/** Recipes (query key ['recipes', 'export']) and the selection state for the Export picker. */
export function useExportPicker(): UseExportPicker {
  const query = useQuery({ queryKey: ['recipes', 'export'], queryFn: () => importApi.recipes() })
  const recipes = query.data ?? []
  const ids = recipes.map((r) => r.id)
  const [selected, setSelected] = useState<number[]>([])

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
  }
}

