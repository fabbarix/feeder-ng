import type { RecipeInput } from '../../features/recipes/types'
import { displayBaseName } from './matchKey'
import { yieldFromLine } from './yield'

// BR-D (design §3.7): the body of "Add "Béchamel" as a new Base recipe" from a line: Yield = the line's amount and unit, no Courses, no Steps, no lines.
// `takeOver` is sent only when the User answered the take-over ask. Pure.
export function newBaseRecipeInput(name: string, quantity: number, unit: string, takeOver?: boolean): RecipeInput {
  const y = yieldFromLine(quantity, unit)
  return {
    name: displayBaseName(name),
    description: '',
    yield: y.yield,
    yieldUnit: y.yieldUnit,
    baseRecipe: true,
    readyMeal: false,
    courseIds: [],
    wholeMeal: false,
    tags: [],
    cooldownDays: null,
    leftoverUseByDays: null,
    frozenUseByDays: null,
    reheatMinutes: null,
    source: { url: '', attribution: '' },
    image: '',
    lines: [],
    steps: [],
    ...(takeOver === undefined ? {} : { takeOver }),
  }
}
