import { useEffect, useState, type ReactNode } from 'react'
import { BaseRecipePicker } from './BaseRecipePicker'
import { PlainIngredientDialog } from './PlainIngredientDialog'
import { TakeOverDialog } from './TakeOverDialog'
import { UnitConversionPrompt } from './UnitConversionPrompt'
import { useEditorLineLinks } from '../hooks/useEditorLineLinks'
import type { LineDraft } from '../lib/draft'
import type { IngredientRef } from '../types'

export interface EditorLineLinkSessionProps {
  /** The Recipe being edited (left out of the picker); undefined for a new one. */
  recipeId: number | undefined
  kind: 'picker' | 'plain'
  line: LineDraft
  /** Every Ingredient the editor knows, by id (the remembered one, the plain choices). */
  ingredientOf: (id: number) => IngredientRef | undefined
  ingredients: readonly IngredientRef[]
  linkLine: (key: string, base: { id: number; name: string; ingredientId: number }) => void
  unlinkLine: (key: string, plain: IngredientRef) => void
  onDone: () => void
  onFailed: (message: string) => void
}

/**
 * BR-D: one Base recipe action of the editor's line, mounted while it runs (its hook needs the Confirm provider, so the editor mounts it only on the
 * User's choice). The picker, the plain Ingredient choice, the take-over ask and the Unit Conversion prompt live here; nothing is saved here.
 */
export function EditorLineLinkSession(props: EditorLineLinkSessionProps): ReactNode {
  const { recipeId, kind, line, ingredientOf, ingredients, linkLine, unlinkLine, onDone, onFailed } = props
  const links = useEditorLineLinks({ ingredientOf, linkLine, unlinkLine })
  const [pickerOpen, setPickerOpen] = useState(kind === 'picker')
  const [settled, setSettled] = useState(false)

  // "Use as a plain Ingredient": back to the remembered Ingredient, or the plain dialog (the hook decides).
  useEffect(() => {
    if (kind === 'plain') {
      links.asPlain(line)
      setSettled(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a session runs once on mount
  }, [])

  // The session ends when the action has settled: no question is pending and nothing failed.
  useEffect(() => {
    if (links.error !== null) {
      onFailed(links.error)
      onDone()
      return
    }
    if (settled && links.takeOverAsk === null && links.unitPrompt === null && links.plainKey === null && !pickerOpen) onDone()
  }, [settled, links.error, links.takeOverAsk, links.unitPrompt, links.plainKey, pickerOpen, onDone, onFailed, links])

  return (
    <>
      <BaseRecipePicker
        open={pickerOpen}
        lineName={line.ingredientName}
        recipeId={recipeId}
        onClose={() => {
          setPickerOpen(false)
          setSettled(true)
        }}
        onChoose={(choice) => {
          setPickerOpen(false)
          void links.linkTo(line, choice).then(() => setSettled(true))
        }}
      />
      <PlainIngredientDialog
        open={links.plainKey !== null}
        ingredients={[...ingredients]}
        onChoose={links.choosePlain}
        onCancel={links.closePlain}
      />
      <TakeOverDialog
        ask={links.takeOverAsk}
        baseName={links.askName}
        onAnswer={(yes) => void links.answerTakeOver(yes)}
        onCancel={links.cancelTakeOver}
      />
      {links.unitPrompt ? (
        <UnitConversionPrompt
          prompt={{
            field: '',
            lineIndex: null,
            useRef: null,
            ingredientId: links.unitPrompt.ingredientId,
            ingredientName: ingredientOf(links.unitPrompt.ingredientId)?.name ?? '',
            unit: links.unitPrompt.unit,
            baseUnit: links.unitPrompt.baseUnit as IngredientRef['baseUnit'],
          }}
          onSave={(toBase) => void links.answerUnitPrompt(toBase)}
          onCancel={links.dismissUnitPrompt}
        />
      ) : null}
    </>
  )
}
