import type { ReactNode } from 'react'
import { Button, Dialog, IngredientSelect } from '../../../ui'
import type { IngredientRef } from '../types'
import { recipeStrings } from '../strings'

export interface PlainIngredientDialogProps {
  /** null = closed. */
  open: boolean
  /** Plain Ingredients only (a Base recipe's Ingredient is never offered here). */
  ingredients: IngredientRef[]
  onChoose: (ingredient: IngredientRef) => void
  onCancel: () => void
}

/** BR-D: "Choose an Ingredient" for a Base recipe line with nothing remembered to go back to: the ordinary Ingredient select, plain Ingredients only. */
export function PlainIngredientDialog({ open, ingredients, onChoose, onCancel }: PlainIngredientDialogProps): ReactNode {
  if (!open) return null
  const plain = ingredients.filter((i) => !i.baseRecipe)
  return (
    <Dialog
      open
      onClose={onCancel}
      title={recipeStrings.baseRecipe.chooseIngredient}
      actions={
        <Button variant="tertiary" onClick={onCancel}>
          {recipeStrings.baseRecipe.cancelChoose}
        </Button>
      }
    >
      <IngredientSelect
        size="full"
        label={recipeStrings.lines.ingredient}
        ingredients={plain}
        value={null}
        onChange={(id) => {
          const picked = plain.find((i) => i.id === id)
          if (picked) onChoose(picked)
        }}
      />
    </Dialog>
  )
}
