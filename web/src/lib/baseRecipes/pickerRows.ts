import { displayBaseName, referenceKey } from './matchKey'
import { yieldText } from './yield'
import type { PickerBaseRecipe, PickerPlannable, PickerRow, PickerRows } from './types'

// BR-D (design §3.7): the rows of the BaseRecipePicker. Pure.

export interface PickerInput {
  /** What the User typed in the picker's search; '' = nothing typed (then the line's Ingredient name ranks the rows). */
  query: string
  /** The line's Ingredient name ("béchamel"). */
  lineName: string
  baseRecipes: readonly PickerBaseRecipe[]
  plannable: readonly PickerPlannable[]
  /** The Recipe being edited: left out of both groups. */
  selfId?: number
  /** Recipe id -> why it cannot be chosen (a cycle): listed disabled with this reason. */
  blocked?: Readonly<Record<number, string>>
}

/** 0 = the name is the query exactly, 1 = it starts with it, 2 = the rest. */
function rankOf(key: string, rankKey: string): number {
  if (key === rankKey) return 0
  if (key.startsWith(rankKey)) return 1
  return 2
}

/**
 * Base recipes: archived and self left out; with a query only the names that contain it (key compare); order: exact name match first,
 * then names that start with it, then the rest by name (with no query the line's Ingredient name plays the query for the ORDER only).
 * Create row: "Add "Béchamel" as a new Base recipe" named from the query, else the line's name; null when blank or when a Base recipe
 * (archived ones included) already has exactly that name. Plannable: archived and self left out, the names containing the query (or the line's
 * name when nothing is typed), by name. A blocked id is disabled with its reason. Base recipe detail reads "Yield 1 l" (unit omitted when null).
 */
export function pickerRows(input: PickerInput): PickerRows {
  const query = input.query.trim()
  const lineKey = referenceKey(input.lineName)
  const queryKey = query === '' ? '' : referenceKey(query)
  const rankKey = query === '' ? lineKey : queryKey
  const blocked = input.blocked ?? {}
  const selfId = input.selfId

  const base: PickerRow[] = input.baseRecipes
    .filter((r) => !r.archived && r.id !== selfId)
    .filter((r) => (queryKey === '' ? true : referenceKey(r.name).includes(queryKey)))
    .map((r) => ({ r, key: referenceKey(r.name) }))
    .sort((a, b) => rankOf(a.key, rankKey) - rankOf(b.key, rankKey) || a.r.name.localeCompare(b.r.name))
    .map(({ r, key }) => {
      const reason = blocked[r.id]
      return {
        kind: 'base' as const,
        id: r.id,
        name: r.name,
        detail: `Yield ${yieldText(r.yield, r.yieldUnit)}`,
        exact: key === rankKey,
        disabled: reason !== undefined,
        ...(reason !== undefined ? { reason } : {}),
      }
    })

  const typedName = query !== '' ? query : input.lineName
  const createName = displayBaseName(typedName)
  const taken = input.baseRecipes.some((r) => referenceKey(r.name) === referenceKey(createName))
  const create: PickerRow | null =
    createName === '' || taken ? null : { kind: 'new', name: createName, label: `Add "${createName}" as a new Base recipe` }

  const plannable: PickerRow[] = input.plannable
    .filter((r) => !r.archived && r.id !== selfId)
    .filter((r) => rankKey !== '' && referenceKey(r.name).includes(rankKey))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((r) => {
      const reason = blocked[r.id]
      return {
        kind: 'plannable' as const,
        id: r.id,
        name: r.name,
        disabled: reason !== undefined,
        ...(reason !== undefined ? { reason } : {}),
      }
    })

  return { base, create, plannable }
}
