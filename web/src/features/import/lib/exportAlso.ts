// BR-E (design §11.1, §13): the Base recipes an export adds ("Also exports Béchamel (Base recipe)"). Export adds every Base recipe a selected
// Recipe calls for, transitively, in discovery order (internal/recipefile/export.go), so the picker walks the same graph. Pure.
import { importStrings } from '../strings'

/** The Base recipe calls of each Recipe the picker has read (GET /api/recipes/{id}), by Recipe id. */
export type CallGraph = Record<number, { name: string; calls: Array<{ id: number; name: string }> }>

/**
 * The Base recipes the export adds beyond the selection, each once, breadth first from the selected Recipes in their order. A Base recipe that is
 * selected itself is left out (it is exported anyway); a Recipe the graph does not know yet adds nothing; a cycle does not loop.
 */
export function alsoExports(selected: readonly number[], graph: CallGraph): Array<{ id: number; name: string }> {
  const chosen = new Set(selected)
  const seen = new Set<number>(selected)
  const queue = [...selected]
  const out: Array<{ id: number; name: string }> = []
  for (let i = 0; i < queue.length; i++) {
    const node = graph[queue[i]!]
    if (!node) continue
    for (const call of node.calls) {
      if (seen.has(call.id)) continue
      seen.add(call.id)
      queue.push(call.id)
      if (!chosen.has(call.id)) out.push({ id: call.id, name: call.name })
    }
  }
  return out
}

/** "Also exports Béchamel (Base recipe)". */
export function alsoExportLabel(name: string): string {
  return importStrings.baseRecipes.alsoExport(name)
}
