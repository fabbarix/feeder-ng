import type { ReactNode } from 'react'
import { DetailList, DetailRow } from '../../../ui'
import { previewFacts, previewLineRow, previewStepRow } from '../lib/reviewSummary'
import { importStrings as s } from '../strings'
import type { RecipePreview } from '../types'

const t = s.reviewRows

/**
 * B9-28 (RX-01, decision RX 3): what the file says about one Recipe, read-only. The Ingredients and the Steps are R-E rows (key, state at the
 * end, muted detail), then one meta line with the Courses, Tags and the Source. A misread is corrected afterwards, with Edit on the Recipe.
 */
export function RecipePreviewPanel({ preview }: { preview: RecipePreview }): ReactNode {
  const facts = previewFacts(preview)
  return (
    <div className="recipe-preview__panel">
      {preview.lines.length > 0 ? (
        <>
          <h3 className="recipe-preview__heading">{t.ingredientsHeading}</h3>
          <DetailList className="recipe-preview__lines">
            {preview.lines.map((line, i) => {
              const row = previewLineRow(line)
              return <DetailRow key={i} label={row.key} state={row.state} detail={row.detail} />
            })}
          </DetailList>
        </>
      ) : null}
      {preview.steps.length > 0 ? (
        <>
          <h3 className="recipe-preview__heading">{t.stepsHeading}</h3>
          <DetailList className="recipe-preview__steps">
            {preview.steps.map((step, i) => {
              const row = previewStepRow(step)
              return (
                <DetailRow
                  key={i}
                  label={
                    <span className="recipe-preview__step">
                      <span className="recipe-preview__step-number">{i + 1}</span>
                      <span className="recipe-preview__step-text">{step.text}</span>
                    </span>
                  }
                  state={row.state}
                  detail={row.detail}
                />
              )
            })}
          </DetailList>
        </>
      ) : null}
      {facts ? <p className="recipe-preview__facts">{facts}</p> : null}
    </div>
  )
}
