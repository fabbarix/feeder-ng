// English UI strings of the recipes feature, split by area (WP-RX-0): strings/list.ts, strings/detail.ts, strings/editor.ts and
// strings/courses.ts. recipeStrings is their union, so every import keeps working; a later package edits only its area module.
import { recipeDetailStrings } from './strings/detail'
import { recipeEditorStrings } from './strings/editor'
import { recipeListStrings } from './strings/list'

export { courseStrings } from './strings/courses'

export const recipeStrings = { ...recipeListStrings, ...recipeDetailStrings, ...recipeEditorStrings } as const

/** The message for a validation or error code, or the generic text. */
export function codeMessage(code: string): string {
  return (recipeStrings.codes as Record<string, string>)[code] ?? recipeStrings.generic
}
