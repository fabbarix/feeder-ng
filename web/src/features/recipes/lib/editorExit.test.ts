// B9-31 (SAFE-06): where Cancel goes, and the question it asks, in lib/editorExit.ts. Pure.
//
//   editorExitRoute(recipeId?)   '/recipes/3' for a stored Recipe, '/recipes' for a new one. Cancel navigates there with `replace`,
//                                never navigate(-1): after a reload, a PWA launch or a shared link there is no in-app history.
//   discardDialog(what, isNew)   the danger dialog Cancel (and the DraftNotice's Discard changes) asks while dirty:
//                                title "Discard your changes?", body "Your changes to <what> are lost." / "This new Recipe is lost.",
//                                Keep editing (cancel) and Discard changes (confirm). No note, no Close.
import { describe, expect, it } from 'vitest'
import { discardDialog, editorExitRoute } from './editorExit'

describe('editorExitRoute', () => {
  it('a stored Recipe goes to its page', () => expect(editorExitRoute(3)).toBe('/recipes/3'))
  it('a new Recipe goes to the list', () => expect(editorExitRoute(undefined)).toBe('/recipes'))
})

describe('discardDialog', () => {
  it('a stored Recipe', () => {
    expect(discardDialog('Pasta al pomodoro', false)).toMatchObject({
      title: 'Discard your changes?',
      body: 'Your changes to Pasta al pomodoro are lost.',
      tone: 'danger',
      cancelLabel: 'Keep editing',
      confirmLabel: 'Discard changes',
    })
  })
  it('a new Recipe', () => {
    expect(discardDialog('Recipe', true)).toMatchObject({ title: 'Discard your changes?', body: 'This new Recipe is lost.', tone: 'danger' })
  })
})
