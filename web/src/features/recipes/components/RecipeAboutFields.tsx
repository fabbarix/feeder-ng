import type { ReactNode } from 'react'
import { TextArea, TextField } from '../../../ui'
import type { DraftErrors, RecipeDraft } from '../lib/draft'
import { codeMessage, recipeStrings } from '../strings'

export interface RecipeAboutFieldsProps {
  draft: RecipeDraft
  errors: DraftErrors
  onChange: (patch: Partial<RecipeDraft>) => void
}

/** RX-02 "Description and source": the description, the Source link and its Attribution. Field primitives only. */
export function RecipeAboutFields({ draft, errors, onChange }: RecipeAboutFieldsProps): ReactNode {
  const f = recipeStrings.fields
  return (
    <div className="recipe-about">
      <TextArea
        size="full"
        label={f.description}
        rows={3}
        value={draft.description}
        error={errors.description ? codeMessage(errors.description) : undefined}
        onChange={(description) => onChange({ description })}
      />
      <div className="recipe-about__source">
        <TextField
          size="full"
          type="url"
          label={f.sourceUrl}
          value={draft.sourceUrl}
          error={errors.sourceUrl ? codeMessage(errors.sourceUrl) : undefined}
          onChange={(sourceUrl) => onChange({ sourceUrl })}
        />
        <TextField size="full" label={f.attribution} value={draft.sourceAttribution} onChange={(sourceAttribution) => onChange({ sourceAttribution })} />
      </div>
    </div>
  )
}
