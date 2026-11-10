import type { ReactNode } from 'react'
import { Button, Chip, IconButton, IngredientSelect, NumberField, Segmented, TextArea, TextField, UnitSelect } from '../../../ui'
import type { DraftErrors, StepDraft, UseDraft } from '../lib/draft'
import { numberText, numberValue } from '../lib/draft'
import { afterOptions, changeKind, moveStep, newStepDraft, removeStep, toggleAfter } from '../lib/steps'
import { needsConversion, unitChoicesOf } from '../lib/lineUnits'
import { addUse, removeUse, setStepImage, updateUse } from '../lib/stepUses'
import { codeMessage, recipeStrings } from '../strings'
import { StepPhoto } from './StepPhoto'
import type { IngredientRef, StepKind } from '../types'

export interface StepsEditorProps {
  steps: StepDraft[]
  errors: DraftErrors
  onChange: (steps: StepDraft[]) => void
  /** Every Ingredient, for the `uses` rows (IngredientSelect + UnitSelect). */
  ingredients?: IngredientRef[]
}

const kindOptions: { value: StepKind; label: string }[] = [
  { value: 'active', label: recipeStrings.steps.active },
  { value: 'passive', label: recipeStrings.steps.passive },
  { value: 'advance', label: recipeStrings.steps.advance },
]

const STEP_FIELDS = ['text', 'kind', 'durationMinutes', 'leadTimeMinutes', 'after']

/**
 * The Steps editor: one card per Step with its text, kind (Segmented: Active, Passive, Advance Step), Duration or
 * Lead time (NumberField), "After" as filter Chips (lib/steps.afterOptions), its `uses` (Ingredient, quantity, unit)
 * and photo, plus reorder and remove. Every change goes through lib/steps and lib/stepUses; this only renders.
 */
export function StepsEditor({ steps, errors, onChange, ingredients = [] }: StepsEditorProps): ReactNode {
  const patch = (i: number, change: Partial<StepDraft>) => onChange(steps.map((s, j) => (j === i ? { ...s, ...change } : s)))
  const patchUse = (i: number, j: number, change: Partial<UseDraft>) => onChange(updateUse(steps, i, j, change))
  const pickUse = (i: number, j: number, ing: IngredientRef) =>
    patchUse(i, j, { ingredientId: ing.id, ingredientName: ing.name, unit: ing.baseUnit })

  /** Step-level problems; the fields of a use show their own. */
  const errorsFor = (i: number): string[] => STEP_FIELDS.map((field) => errors[`steps.${i}.${field}`]).filter((code): code is string => code !== undefined)

  return (
    <div className="steps-editor">
      {steps.length === 0 ? <p className="steps-editor__empty">{recipeStrings.steps.empty}</p> : null}
      <ol className="steps-editor__list">
        {steps.map((s, i) => {
          const afterChoices = afterOptions(steps, i)
          return (
            <li key={s.key} className="step-card">
              <div className="step-card__head">
                <span className="step-card__number" data-step-number="">
                  {i + 1}
                </span>
                <div className="step-card__moves">
                  <IconButton icon="moveUp" label={recipeStrings.steps.up} disabled={i === 0} onClick={() => onChange(moveStep(steps, i, i - 1))} />
                  <IconButton
                    icon="moveDown"
                    label={recipeStrings.steps.down}
                    disabled={i === steps.length - 1}
                    onClick={() => onChange(moveStep(steps, i, i + 1))}
                  />
                  <IconButton icon="delete" label={recipeStrings.steps.remove} onClick={() => onChange(removeStep(steps, i))} />
                </div>
              </div>
              <TextArea label={recipeStrings.steps.text} rows={2} value={s.text} onChange={(text) => patch(i, { text })} />
              <Segmented
                label={recipeStrings.steps.kind}
                options={kindOptions}
                value={s.kind}
                onChange={(kind) => onChange(changeKind(steps, i, kind))}
              />
              {s.kind === 'advance' ? (
                <NumberField
                  label={recipeStrings.steps.lead}
                  hideStepper
                  value={numberValue(s.leadTimeMinutes)}
                  onChange={(n) => patch(i, { leadTimeMinutes: numberText(n) })}
                />
              ) : (
                <NumberField
                  label={recipeStrings.steps.duration}
                  hideStepper
                  value={numberValue(s.durationMinutes)}
                  onChange={(n) => patch(i, { durationMinutes: numberText(n) })}
                />
              )}
              {afterChoices.length > 0 ? (
                <div role="group" aria-label={recipeStrings.steps.after} className="step-card__after">
                  <span className="step-card__label">{recipeStrings.steps.after}</span>
                  {afterChoices.map((j) => (
                    <Chip
                      key={j}
                      kind="filter"
                      selected={s.after.includes(j)}
                      onClick={() => onChange(toggleAfter(steps, i, j, !s.after.includes(j)))}
                    >
                      {recipeStrings.steps.afterStep(j + 1)}
                    </Chip>
                  ))}
                </div>
              ) : null}

              <div className="step-card__uses">
                <p className="step-card__label">{recipeStrings.steps.usesTitle}</p>
                <ul className="step-card__use-list">
                  {s.uses.map((u, j) => (
                    <UseRow
                      key={u.key}
                      use={u}
                      ingredients={ingredients}
                      errors={errors}
                      index={{ step: i, use: j }}
                      onPick={(ing) => pickUse(i, j, ing)}
                      onChange={(change) => patchUse(i, j, change)}
                      onRemove={() => onChange(removeUse(steps, i, j))}
                    />
                  ))}
                </ul>
                <Button variant="tertiary" icon="add" onClick={() => onChange(addUse(steps, i))}>
                  {recipeStrings.steps.addUse}
                </Button>
              </div>

              <StepPhoto imageId={s.image} onChange={(id) => onChange(setStepImage(steps, i, id))} />

              {errorsFor(i).map((code) => (
                <p role="alert" key={code} className="step-card__error">
                  {codeMessage(code)}
                </p>
              ))}
            </li>
          )
        })}
      </ol>
      <Button variant="secondary" icon="add" onClick={() => onChange([...steps, newStepDraft()])}>
        {recipeStrings.steps.add}
      </Button>
    </div>
  )
}

interface UseRowProps {
  use: UseDraft
  ingredients: IngredientRef[]
  errors: DraftErrors
  index: { step: number; use: number }
  onPick: (ingredient: IngredientRef) => void
  onChange: (change: Partial<UseDraft>) => void
  onRemove: () => void
}

/** One use of a Step: Ingredient, quantity (text, fractions typeable) and unit, a hint for a unit the Ingredient does not know, remove. */
function UseRow({ use, ingredients, errors, index, onPick, onChange, onRemove }: UseRowProps): ReactNode {
  const ingredient = ingredients.find((ing) => ing.id === use.ingredientId)
  const base = `steps.${index.step}.uses.${index.use}`
  const asks = needsConversion(use.unit, ingredient)
  const err = (f: string) => (errors[`${base}.${f}`] ? codeMessage(errors[`${base}.${f}`]!) : undefined)
  return (
    <li className="use-row">
      <IngredientSelect
        label={recipeStrings.steps.useIngredient}
        ingredients={ingredients}
        value={use.ingredientId}
        error={err('ingredient')}
        onChange={(id) => {
          const picked = ingredients.find((ing) => ing.id === id)
          if (picked) onPick(picked)
        }}
      />
      <TextField label={recipeStrings.steps.useQuantity} inputMode="decimal" value={use.quantity} error={err('quantity')} onChange={(quantity) => onChange({ quantity })} />
      <UnitSelect
        label={recipeStrings.steps.useUnit}
        units={ingredient ? unitChoicesOf(ingredient) : { baseUnit: use.unit, conversions: [], globalUnits: [] }}
        value={use.unit || null}
        disabled={!ingredient}
        error={err('unit')}
        onChange={(unit) => onChange({ unit })}
        onCreate={(unit) => onChange({ unit })}
        createLabel={recipeStrings.lines.useUnit}
      />
      {asks ? <p className="use-row__hint">{recipeStrings.lines.unitNeedsConversion(use.unit)}</p> : null}
      <IconButton icon="close" label={recipeStrings.steps.removeUse} onClick={onRemove} />
    </li>
  )
}
