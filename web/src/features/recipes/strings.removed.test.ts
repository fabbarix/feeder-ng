// B9-31 (SAFE-10): the words of the removal toasts, in strings/editor.ts as recipeStrings.removed (pinned here, spelled as the chapter
// does: "Step 1 removed", "Flour line removed", "Tomato use removed from Step 2"; Undo's accessible name "Undo: put Step 1 back").
// A name is capitalised at its first letter; a line with no Ingredient yet is "Line 3", a use with none is "Ingredient use".
import { describe, expect, it } from 'vitest'
import { recipeStrings } from './strings'

describe('recipeStrings.removed', () => {
  it('a Step', () => {
    expect(recipeStrings.removed.step(1)).toBe('Step 1 removed')
    expect(recipeStrings.removed.undo.step(1)).toBe('Undo: put Step 1 back')
  })
  it('an ingredient line, by its Ingredient or its number', () => {
    expect(recipeStrings.removed.line('flour', 1)).toBe('Flour line removed')
    expect(recipeStrings.removed.undo.line('flour', 1)).toBe('Undo: put Flour line back')
    expect(recipeStrings.removed.line('', 3)).toBe('Line 3 removed')
    expect(recipeStrings.removed.undo.line('  ', 3)).toBe('Undo: put Line 3 back')
  })
  it('an ingredient use, naming the Step', () => {
    expect(recipeStrings.removed.use('tomato', 2)).toBe('Tomato use removed from Step 2')
    expect(recipeStrings.removed.undo.use('tomato', 2)).toBe('Undo: put Tomato use back')
    expect(recipeStrings.removed.use('', 2)).toBe('Ingredient use removed from Step 2')
  })
})
