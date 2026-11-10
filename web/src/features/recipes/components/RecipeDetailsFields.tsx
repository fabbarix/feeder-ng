import type { ReactNode } from 'react'
import { Checkbox, NumberField, TextArea, TextField } from '../../../ui'
import { codeMessage, recipeStrings } from '../strings'
import { numberText, numberValue, type DraftErrors, type RecipeDraft } from '../lib/draft'
import { TagInput } from './TagInput'

export interface RecipeDetailsFieldsProps {
  draft: RecipeDraft
  errors: DraftErrors
  onChange: (patch: Partial<RecipeDraft>) => void
}

const fieldError = (errors: DraftErrors, key: string) => (errors[key] ? codeMessage(errors[key]) : undefined)

/** The name, description, Yield, Ready Meal, Tags, Cool-down and Use-by overrides, and the source of a Recipe: field primitives only. */
export function RecipeDetailsFields({ draft, errors, onChange }: RecipeDetailsFieldsProps): ReactNode {
  const f = recipeStrings.fields
  return (
    <div className="recipe-details">
      <TextField label={f.name} value={draft.name} error={fieldError(errors, 'name')} onChange={(name) => onChange({ name })} />
      <TextArea label={f.description} rows={3} value={draft.description} onChange={(description) => onChange({ description })} />
      <NumberField
        label={f.yield}
        hideStepper
        value={numberValue(draft.yield)}
        error={fieldError(errors, 'yield')}
        onChange={(n) => onChange({ yield: numberText(n) })}
      />
      <Checkbox label={f.readyMeal} description={f.readyMealHint} checked={draft.readyMeal} onChange={(readyMeal) => onChange({ readyMeal })} />
      <TagInput tags={draft.tags} onChange={(tags) => onChange({ tags })} />
      <NumberField
        label={f.cooldown}
        helper={f.cooldownHint}
        hideStepper
        value={numberValue(draft.cooldownDays)}
        error={fieldError(errors, 'cooldownDays')}
        onChange={(n) => onChange({ cooldownDays: numberText(n) })}
      />
      <NumberField
        label={f.useBy}
        helper={f.useByHint}
        hideStepper
        value={numberValue(draft.leftoverUseByDays)}
        error={fieldError(errors, 'leftoverUseByDays')}
        onChange={(n) => onChange({ leftoverUseByDays: numberText(n) })}
      />
      <TextField type="url" label={f.sourceUrl} value={draft.sourceUrl} error={fieldError(errors, 'sourceUrl')} onChange={(sourceUrl) => onChange({ sourceUrl })} />
      <TextField label={f.attribution} value={draft.sourceAttribution} onChange={(sourceAttribution) => onChange({ sourceAttribution })} />
    </div>
  )
}
