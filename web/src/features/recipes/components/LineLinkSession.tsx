import { useEffect, useState, type ReactNode } from 'react'
import { useLineLink, type LinkChoice, type LinkOutcome, type SavedLine } from '../../../lib/baseRecipes/useLineLink'
import { TakeOverDialog } from './TakeOverDialog'
import { BaseRecipePicker } from './BaseRecipePicker'
import { PlainIngredientDialog } from './PlainIngredientDialog'
import { UnitConversionPrompt } from './UnitConversionPrompt'
import type { IngredientRef, RecipeLine } from '../types'

/** One line action of the detail: the picker ("Link to a Base recipe") or "Use as a plain Ingredient". */
export type LineSession = { kind: 'picker' | 'plain'; line: RecipeLine }

export function savedLineOf(line: RecipeLine): SavedLine {
  return {
    id: line.id ?? 0,
    ingredientName: line.ingredient ?? '',
    quantity: line.quantity,
    unit: line.unit,
    linkedFromIngredientId: line.linkedFromIngredientId ?? null,
    baseRecipe: line.baseRecipe ? { id: line.baseRecipe.id, name: line.baseRecipe.name } : null,
  }
}

export interface LineLinkSessionProps {
  recipeId: number
  session: LineSession
  /** The Ingredients the detail knows (for the remembered one and the plain choices). */
  refs: ReadonlyMap<number, IngredientRef>
  onChanged: () => void
  /** The action is over (done, cancelled, or refused in words): the session unmounts. */
  onDone: () => void
  /** The words of a refusal, shown by the screen when the action failed. */
  onFailed: (message: string) => void
}

/**
 * BR-D: one line action of the detail, mounted while it runs (its hook needs the Toast and Confirm providers, so the detail mounts it only on a
 * User's choice). The picker, the take-over ask, the Unit Conversion prompt and the plain Ingredient choice all live here.
 */
export function LineLinkSession({ recipeId, session, refs, onChanged, onDone, onFailed }: LineLinkSessionProps): ReactNode {
  const links = useLineLink({ recipeId, onChanged })
  const [pickerOpen, setPickerOpen] = useState(session.kind === 'picker')
  const [plainOpen, setPlainOpen] = useState(false)
  const line = session.line
  const remembered = line.linkedFromIngredientId

  useEffect(() => {
    if (session.kind !== 'plain') return
    // Back to the remembered Ingredient when it still exists; else (nothing remembered, or it is gone) the User chooses one.
    if (remembered === null || remembered === undefined || !refs.has(remembered)) {
      setPlainOpen(true)
      return
    }
    // A refusal ends the session through the error effect below (it reports the words first); only 'done' ends it here.
    void links.useAsPlain(savedLineOf(line)).then((outcome) => {
      if (outcome === 'pick') setPlainOpen(true)
      else if (outcome === 'done') onDone()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a session runs once on mount
  }, [])

  // A refusal is shown by the screen (the words are the hook's); the session then ends.
  useEffect(() => {
    if (links.error !== null) {
      onFailed(links.error)
      onDone()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- report each refusal once
  }, [links.error])

  const finish = (outcome: LinkOutcome) => {
    if (outcome !== 'asked' && outcome !== 'unit_prompt' && outcome !== 'failed') onDone()
  }

  return (
    <>
      <BaseRecipePicker
        open={pickerOpen}
        lineName={line.ingredient ?? ''}
        recipeId={recipeId}
        onClose={() => {
          setPickerOpen(false)
          onDone()
        }}
        onChoose={(choice: LinkChoice) => {
          setPickerOpen(false)
          void links.linkTo(savedLineOf(line), choice).then(finish)
        }}
      />
      <PlainIngredientDialog
        open={plainOpen}
        ingredients={Array.from(refs.values())}
        onChoose={(ingredient) => {
          setPlainOpen(false)
          void links.useAsPlain(savedLineOf(line), ingredient.id).then(() => onDone())
        }}
        onCancel={() => {
          setPlainOpen(false)
          onDone()
        }}
      />
      <TakeOverDialog
        ask={links.takeOverAsk}
        baseName={links.askName ?? ''}
        onAnswer={(yes) => void links.answerTakeOver(yes).then(finish)}
        onCancel={() => {
          links.cancelTakeOver()
          onDone()
        }}
      />
      {links.unitPrompt ? (
        <UnitConversionPrompt
          prompt={{
            field: '',
            lineIndex: null,
            useRef: null,
            ingredientId: links.unitPrompt.ingredientId,
            ingredientName: refs.get(links.unitPrompt.ingredientId)?.name ?? '',
            unit: links.unitPrompt.unit,
            baseUnit: links.unitPrompt.baseUnit as IngredientRef['baseUnit'],
          }}
          onSave={(toBase) => void links.answerUnitPrompt(toBase).then(finish)}
          onCancel={() => {
            links.dismissUnitPrompt()
            onDone()
          }}
        />
      ) : null}
    </>
  )
}
