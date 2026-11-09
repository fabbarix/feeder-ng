import type { ReactNode } from 'react'
import { codeMessage, recipeStrings } from '../strings'
import type { DraftErrors, RecipeDraft } from '../lib/draft'
import { TagInput } from './TagInput'

export interface RecipeDetailsFieldsProps {
  draft: RecipeDraft
  errors: DraftErrors
  onChange: (patch: Partial<RecipeDraft>) => void
}

/** The name, description, Yield, Ready Meal, Tags, Cool-down and Use-by overrides, and the source of a Recipe. */
export function RecipeDetailsFields({ draft, errors, onChange }: RecipeDetailsFieldsProps): ReactNode {
  const f = recipeStrings.fields
  const error = (key: string) => (errors[key] ? <p role="alert">{codeMessage(errors[key]!)}</p> : null)
  return (
    <div>
      <label>
        {f.name}
        <input value={draft.name} onChange={(e) => onChange({ name: e.target.value })} />
      </label>
      {error('name')}
      <label>
        {f.description}
        <textarea value={draft.description} onChange={(e) => onChange({ description: e.target.value })} />
      </label>
      <label>
        {f.yield}
        <input inputMode="decimal" value={draft.yield} onChange={(e) => onChange({ yield: e.target.value })} />
      </label>
      {error('yield')}
      <label>
        <input type="checkbox" checked={draft.readyMeal} onChange={(e) => onChange({ readyMeal: e.target.checked })} />
        {f.readyMeal}
        <span> — {f.readyMealHint}</span>
      </label>
      <div>
        <span>{f.tags}</span>
        <TagInput tags={draft.tags} onChange={(tags) => onChange({ tags })} />
      </div>
      <label>
        {f.cooldown}
        <input inputMode="numeric" value={draft.cooldownDays} placeholder={f.cooldownHint} onChange={(e) => onChange({ cooldownDays: e.target.value })} />
      </label>
      {error('cooldownDays')}
      <label>
        {f.useBy}
        <input inputMode="numeric" value={draft.leftoverUseByDays} placeholder={f.useByHint} onChange={(e) => onChange({ leftoverUseByDays: e.target.value })} />
      </label>
      {error('leftoverUseByDays')}
      <label>
        {f.sourceUrl}
        <input type="url" value={draft.sourceUrl} onChange={(e) => onChange({ sourceUrl: e.target.value })} />
      </label>
      {error('sourceUrl')}
      <label>
        {f.attribution}
        <input value={draft.sourceAttribution} onChange={(e) => onChange({ sourceAttribution: e.target.value })} />
      </label>
    </div>
  )
}
