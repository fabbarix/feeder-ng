import type { ReactNode } from 'react'
import { Checkbox, FieldRow, NumberField, TextArea, TextField } from '../../../ui'
import { codeMessage, recipeStrings } from '../strings'
import { numberText, numberValue, type DraftErrors, type RecipeDraft } from '../lib/draft'
import { TagInput } from './TagInput'

export interface RecipeDetailsFieldsProps {
  draft: RecipeDraft
  errors: DraftErrors
  onChange: (patch: Partial<RecipeDraft>) => void
}

const fieldError = (errors: DraftErrors, key: string) => (errors[key] ? codeMessage(errors[key]) : undefined)

/** The name, description, Yield, Ready Meal, Tags, Cool-down and Use-by overrides, the Reheat time, and the source of a Recipe: field primitives only. */
export function RecipeDetailsFields({ draft, errors, onChange }: RecipeDetailsFieldsProps): ReactNode {
  const f = recipeStrings.fields
  return (
    <div className="recipe-details">
      <TextField size="lg" label={f.name} value={draft.name} error={fieldError(errors, 'name')} onChange={(name) => onChange({ name })} />
      <TextArea
        size="full"
        label={f.description}
        rows={3}
        value={draft.description}
        onChange={(description) => onChange({ description })}
      />
      <FieldRow>
        <NumberField
          size="xs"
          label={f.yield}
          min={1}
          value={numberValue(draft.yield)}
          error={fieldError(errors, 'yield')}
          onChange={(n) => onChange({ yield: numberText(n) })}
        />
        <NumberField
          size="xs"
          label={f.cooldown}
          unit="days"
          helper={f.cooldownHint}
          hideStepper
          value={numberValue(draft.cooldownDays)}
          error={fieldError(errors, 'cooldownDays')}
          onChange={(n) => onChange({ cooldownDays: numberText(n) })}
        />
        <NumberField
          size="xs"
          label={f.useBy}
          unit="days"
          helper={f.useByHint}
          hideStepper
          value={numberValue(draft.leftoverUseByDays)}
          error={fieldError(errors, 'leftoverUseByDays')}
          onChange={(n) => onChange({ leftoverUseByDays: numberText(n) })}
        />
        <NumberField
          size="xs"
          label={f.reheat}
          unit="min"
          helper={f.reheatHint}
          hideStepper
          value={numberValue(draft.reheatMinutes)}
          error={fieldError(errors, 'reheatMinutes')}
          onChange={(n) => onChange({ reheatMinutes: numberText(n) })}
        />
      </FieldRow>
      <Checkbox
        label={f.readyMeal}
        description={f.readyMealHint}
        checked={draft.readyMeal}
        onChange={(readyMeal) => onChange({ readyMeal })}
      />
      <TagInput tags={draft.tags} onChange={(tags) => onChange({ tags })} />
      <FieldRow>
        <TextField
          size="lg"
          type="url"
          label={f.sourceUrl}
          value={draft.sourceUrl}
          error={fieldError(errors, 'sourceUrl')}
          onChange={(sourceUrl) => onChange({ sourceUrl })}
        />
        <TextField
          size="md"
          label={f.attribution}
          value={draft.sourceAttribution}
          onChange={(sourceAttribution) => onChange({ sourceAttribution })}
        />
      </FieldRow>
    </div>
  )
}
