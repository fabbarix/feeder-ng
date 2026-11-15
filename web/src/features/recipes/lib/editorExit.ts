// B9-31 (SAFE-06): where the editor's Cancel goes, and the question it asks while there are changes. Pure; no React.
import type { ConfirmOptions } from '../../../ui'

/** Cancel's destination, always a known route (navigated with `replace`, never history back): the Recipe, or the list for a new one. */
export function editorExitRoute(recipeId: number | undefined): string {
  return recipeId === undefined ? '/recipes' : `/recipes/${recipeId}`
}

export const editorExitStrings = {
  title: 'Discard your changes?',
  body: (what: string) => `Your changes to ${what} are lost.`,
  bodyNew: 'This new Recipe is lost.',
  keep: 'Keep editing',
  discard: 'Discard changes',
} as const

/** The danger dialog Cancel (and the DraftNotice's Discard changes) asks while dirty. Keep editing is the focused cancel. */
export function discardDialog(what: string, isNew: boolean): ConfirmOptions {
  return {
    title: editorExitStrings.title,
    body: isNew ? editorExitStrings.bodyNew : editorExitStrings.body(what),
    tone: 'danger',
    icon: 'error',
    cancelLabel: editorExitStrings.keep,
    confirmLabel: editorExitStrings.discard,
  }
}
