import { ApiError } from '../http'

// BR-D (design §10, §16): the words of the refusals the Base recipe routes answer with. Pure; the screens show the message.

/** "Roux calls for Béchamel, which calls for Roux" from path [Roux, Béchamel, Roux]; a self call [A, A] reads "Béchamel calls for itself". */
export function cycleMessage(path: readonly string[]): string {
  if (path.length < 2) return path.join(' ')
  if (path.length === 2 && path[0] === path[1]) return `${path[0]} calls for itself`
  const [first, second, ...rest] = path
  return [`${first} calls for ${second}`, ...rest.map((name) => `which calls for ${name}`)].join(', ')
}

export interface InUseRefusal {
  /** "Béchamel is used in Lasagne and Moussaka" */
  message: string
  usedBy: Array<{ id: number; name: string }>
  /** The dialog offers this instead of Delete. */
  alternate: 'Archive instead'
}

/** "A", "A and B", "A, B and C". */
export function joinNames(names: readonly string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]!
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** The 409 `base_recipe_in_use` (details.usedBy) for deleting or turning back the Base recipe `name`; null for any other error. */
export function inUseRefusal(err: unknown, name: string): InUseRefusal | null {
  if (!(err instanceof ApiError) || err.code !== 'base_recipe_in_use') return null
  const usedBy = (err.details.usedBy as Array<{ id: number; name: string }> | undefined) ?? []
  return { message: `${name} is used in ${joinNames(usedBy.map((u) => u.name))}`, usedBy, alternate: 'Archive instead' }
}

const REASONS: Record<string, string> = {
  base_recipe_name_taken: 'Another Base recipe already has this name. Choose a different name.',
  ready_meal_name_taken: 'A Ready Meal already has this name. Choose a different name.',
  yield_unit_invalid: 'Choose a unit for the Yield.',
  yield_invalid: 'The Yield must be more than 0.',
  base_recipe_ready_meal: 'A Ready Meal cannot be a Base recipe.',
  base_recipe_field: 'That field does not apply to a Base recipe.',
  needed_at_step_invalid: 'That Step no longer exists. Choose another.',
  not_a_candidate: 'One of those lines can no longer be linked. Reopen the list.',
  line_not_plain: 'That line already calls for a Base recipe.',
  line_not_base: 'That line is already a plain Ingredient.',
  link_invalid: 'That line cannot be linked to a Base recipe.',
  kind_invalid: 'That Recipe cannot change its kind.',
  base_recipe_kind: 'A Base recipe cannot be planned.',
  base_recipe_preference: 'A Base recipe takes only an Exclusion.',
}

/**
 * The inline message of a Base recipe refusal, or null when the error is not one (the caller shows its generic text).
 * 422 validation_failed by details.reason: base_recipe_cycle (cycleMessage of details.path), base_recipe_name_taken, ready_meal_name_taken,
 * yield_unit_invalid, yield_invalid, base_recipe_ready_meal, base_recipe_field, needed_at_step_invalid, line_not_plain, line_not_base,
 * link_invalid, not_a_candidate, kind_invalid, base_recipe_kind, base_recipe_preference;
 * 409 base_recipe_ingredient, 409 ingredient_name_taken (details.ingredient.name); 409 base_recipe_in_use is inUseRefusal, not here.
 */
export function refusalMessage(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null
  if (err.status === 422 && err.code === 'validation_failed') {
    const reason = err.details.reason
    if (reason === 'base_recipe_cycle') return cycleMessage((err.details.path as string[] | undefined) ?? [])
    return typeof reason === 'string' && reason in REASONS ? REASONS[reason]! : null
  }
  if (err.status === 409 && err.code === 'ingredient_name_taken') {
    const ingredient = err.details.ingredient as { name?: string } | undefined
    return `An Ingredient named ${ingredient?.name ?? ''} already exists. Merge or rename it first.`
  }
  if (err.status === 409 && err.code === 'base_recipe_ingredient') return 'This Ingredient belongs to a Base recipe. Rename the Base recipe instead.'
  return null
}
