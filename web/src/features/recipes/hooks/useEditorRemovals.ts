// B9-31 (SAFE-10), moved out of RecipeEditorScreen by the w2c review (no logic in components): removing a line, a Step or a Step's use
// acts at once, offers Undo in a toast, and moves focus to what took the removed row's place (and back on Undo).
import type { RefObject } from 'react'
import { useUndoToast } from '../../../ui'
import { recipeStrings } from '../strings'
import type { IngredientRef } from '../types'
import type { UseRecipeEditor } from './useRecipeEditor'
import { useRemovalFocus } from './useRemovalFocus'

export interface EditorRemovals {
  removeLine: (key: string) => void
  removeStep: (index: number) => void
  removeUse: (stepIndex: number, useIndex: number) => void
}

/** The name a line or use shows: its typed Ingredient name, else the known Ingredient's, else ''. */
function nameOf(x: { ingredientName?: string | null; ingredientId?: number | null } | undefined, byId: ReadonlyMap<number, IngredientRef>): string {
  if (!x) return ''
  return (x.ingredientName || (x.ingredientId === null || x.ingredientId === undefined ? '' : byId.get(x.ingredientId)?.name) || '').trim()
}

export function useEditorRemovals(editor: UseRecipeEditor, byId: ReadonlyMap<number, IngredientRef>, formRef: RefObject<HTMLElement | null>): EditorRemovals {
  const undoToast = useUndoToast()
  const focusAfter = useRemovalFocus(formRef)
  const removeLine = (key: string) => {
    const lines = editor.draft?.lines ?? []
    const index = lines.findIndex((l) => l.key === key)
    const name = nameOf(lines[index], byId)
    const restore = editor.removeLine(key)
    if (!restore) return
    focusAfter({ kind: 'line', index })
    undoToast.show({
      headline: recipeStrings.removed.line(name, index + 1),
      undoAriaLabel: recipeStrings.removed.undo.line(name, index + 1),
      undo: () => {
        restore()
        focusAfter({ kind: 'line', index })
      },
    })
  }
  const removeStep = (index: number) => {
    const restore = editor.removeStep(index)
    if (!restore) return
    focusAfter({ kind: 'step', index })
    undoToast.show({
      headline: recipeStrings.removed.step(index + 1),
      undoAriaLabel: recipeStrings.removed.undo.step(index + 1),
      undo: () => {
        restore()
        focusAfter({ kind: 'step', index })
      },
    })
  }
  const removeUse = (stepIndex: number, useIndex: number) => {
    const step = editor.draft?.steps[stepIndex]
    const use = step?.uses[useIndex]
    if (!step || !use) return
    const name = nameOf(use, byId)
    const restore = editor.removeUse(stepIndex, useIndex)
    if (!restore) return
    focusAfter({ kind: 'use', stepKey: step.key, index: useIndex })
    undoToast.show({
      headline: recipeStrings.removed.use(name, stepIndex + 1),
      undoAriaLabel: recipeStrings.removed.undo.use(name, stepIndex + 1),
      undo: () => {
        restore()
        focusAfter({ kind: 'use', stepKey: step.key, index: useIndex })
      },
    })
  }
  return { removeLine, removeStep, removeUse }
}
