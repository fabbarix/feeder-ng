// "Something else" (SR5, 13.5 step 2): Ingredient | Supply as a Segmented, the Select of that kind with its create row, the Base Unit of a
// new one, and the near-duplicate guard.
import { Button, Segmented, Select } from '../../../ui'
import type { SelectOption } from '../../../ui/Select/lib'
import type { Ingredient, IngredientKind } from '../../ingredients/types'
import type { DuplicateGuard } from '../../ingredients/lib/newIngredient'
import { scanStrings } from '../strings'
import { BASE_UNIT_CHOICES, choiceValue, kindChoiceOptions, NEW_CHOICE_VALUE } from '../lib/newProductSelect'
import type { IngredientChoice } from '../lib/unknownForm'
import type { BaseUnit } from '../types'
import { newProductStrings } from '../newProductStrings'
import './NewProductSheet.css'

export interface NewProductKindProps {
  kind: IngredientKind
  onKind: (kind: IngredientKind) => void
  choices: IngredientChoice[]
  chosen: IngredientChoice | null
  error: boolean
  onPick: (id: number) => void
  onCreate: (name: string) => void
  onBaseUnit: (unit: BaseUnit) => void
  guard: DuplicateGuard
  onAdopt: (ingredient: Ingredient) => void
  onKeepNew: () => void
}

const KIND_OPTIONS: { value: IngredientKind; label: string }[] = [
  { value: 'food', label: newProductStrings.kindIngredient },
  { value: 'supply', label: newProductStrings.kindSupply },
]

export function NewProductKind(p: NewProductKindProps) {
  const label = p.kind === 'supply' ? newProductStrings.kindSupply : newProductStrings.kindIngredient
  const options: SelectOption<number>[] = kindChoiceOptions(p.choices, p.kind, p.chosen)
  const existing = p.guard.kind === 'exists' ? p.guard.ingredient : null
  return (
    <div className="new-product__kind">
      <Segmented<IngredientKind> label={newProductStrings.kindLabel} options={KIND_OPTIONS} value={p.kind} onChange={p.onKind} />
      <Select<number>
        label={label}
        searchable
        options={options}
        value={choiceValue(p.chosen)}
        onChange={(id) => {
          if (id !== NEW_CHOICE_VALUE) p.onPick(id)
        }}
        onCreate={p.onCreate}
        createLabel={(query) => (p.kind === 'supply' ? newProductStrings.newSupplyRow(query) : newProductStrings.newIngredientRow(query))}
        error={p.error ? newProductStrings.needKind : undefined}
      />
      {existing ? (
        <div className="new-product__guard" role="status" tabIndex={-1}>
          <p>{scanStrings.guard.alreadyExists(existing.name)}</p>
          <Button variant="tertiary" onClick={() => p.onAdopt(existing)}>
            {scanStrings.guard.useExisting(existing.name)}
          </Button>
        </div>
      ) : null}
      {p.guard.kind === 'similar' ? (
        <div className="new-product__guard" role="status" tabIndex={-1}>
          <p>{scanStrings.guard.didYouMean(p.guard.suggestions.map((s) => s.ingredient.name).join(', '))}</p>
          <div className="new-product__chips">
            {p.guard.suggestions.map((s) => (
              <Button key={s.ingredient.id} variant="tertiary" onClick={() => p.onAdopt(s.ingredient)}>
                {scanStrings.guard.useExisting(s.ingredient.name)}
              </Button>
            ))}
            <Button variant="tertiary" onClick={p.onKeepNew}>
              {scanStrings.guard.createAnyway(p.chosen?.name ?? '')}
            </Button>
          </div>
        </div>
      ) : null}
      {p.chosen && p.chosen.id === undefined ? (
        <Segmented<BaseUnit> label={newProductStrings.baseUnitLabel} options={BASE_UNIT_CHOICES.map((u) => ({ value: u, label: u }))} value={p.chosen.baseUnit} onChange={p.onBaseUnit} />
      ) : null}
    </div>
  )
}
