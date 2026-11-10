import type { ReactNode } from 'react'
import { Button } from '../../../ui'
import type { DraftErrors, StepDraft } from '../lib/draft'
import { afterOptions, changeKind, moveStep, newStepDraft, removeStep, toggleAfter } from '../lib/steps'
import { codeMessage, recipeStrings } from '../strings'
import type { IngredientRef, StepKind } from '../types'

export interface StepsEditorProps {
  steps: StepDraft[]
  errors: DraftErrors
  onChange: (steps: StepDraft[]) => void
  /** Every Ingredient, for the `uses` rows (IngredientSelect + UnitSelect). */
  ingredients?: IngredientRef[]
  /** Uploads a Step photo and resolves with its image id (null on failure; `error` then says why). */
  imageUpload?: { upload: (file: File) => Promise<string | null>; uploading: boolean; error: string | null }
}

const kindOptions: { value: StepKind; label: string }[] = [
  { value: 'active', label: recipeStrings.steps.active },
  { value: 'passive', label: recipeStrings.steps.passive },
  { value: 'advance', label: recipeStrings.steps.advance },
]

/**
 * The Steps editor: one row per Step (text, kind select Active / Passive / Advance Step, "Duration
 * (min)" for Active and Passive or "Lead time (min)" for an Advance Step, "After" checkboxes from
 * lib/steps.afterOptions, remove, move up/down) and an "Add Step" button. All reordering and
 * dependency remapping goes through lib/steps; the component only renders and calls onChange.
 */
export function StepsEditor({ steps, errors, onChange }: StepsEditorProps): ReactNode {
  const patch = (i: number, change: Partial<StepDraft>) =>
    onChange(steps.map((s, j) => (j === i ? { ...s, ...change } : s)))

  const add = () => onChange([...steps, newStepDraft()])

  const errorsFor = (i: number) =>
    ['text', 'durationMinutes', 'leadTimeMinutes', 'kind', 'after']
      .map((field) => errors[`steps.${i}.${field}`])
      .filter((code): code is string => code !== undefined)

  return (
    <div>
      {steps.length === 0 ? <p>{recipeStrings.steps.empty}</p> : null}
      <ol>
        {steps.map((s, i) => (
          <li key={s.key}>
            <label>
              {recipeStrings.steps.text}
              <input value={s.text} onChange={(e) => patch(i, { text: e.target.value })} />
            </label>
            <label>
              {recipeStrings.steps.kind}
              <select
                value={s.kind}
                onChange={(e) => onChange(changeKind(steps, i, e.target.value as StepKind))}
              >
                {kindOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {s.kind === 'advance' ? (
              <label>
                {recipeStrings.steps.lead}
                <input inputMode="numeric" value={s.leadTimeMinutes} onChange={(e) => patch(i, { leadTimeMinutes: e.target.value })} />
              </label>
            ) : (
              <label>
                {recipeStrings.steps.duration}
                <input inputMode="numeric" value={s.durationMinutes} onChange={(e) => patch(i, { durationMinutes: e.target.value })} />
              </label>
            )}
            {afterOptions(steps, i).length > 0 ? (
              <fieldset>
                <legend>{recipeStrings.steps.after}</legend>
                {afterOptions(steps, i).map((j) => (
                  <label key={j}>
                    <input
                      type="checkbox"
                      checked={s.after.includes(j)}
                      onChange={(e) => onChange(toggleAfter(steps, i, j, e.target.checked))}
                    />
                    {recipeStrings.steps.afterStep(j + 1)}
                  </label>
                ))}
              </fieldset>
            ) : null}
            {errorsFor(i).map((code) => (
              <p role="alert" key={code}>
                {codeMessage(code)}
              </p>
            ))}
            <div>
              <Button variant="ghost" aria-label={recipeStrings.steps.up} disabled={i === 0} onClick={() => onChange(moveStep(steps, i, i - 1))}>
                ↑
              </Button>
              <Button
                variant="ghost"
                aria-label={recipeStrings.steps.down}
                disabled={i === steps.length - 1}
                onClick={() => onChange(moveStep(steps, i, i + 1))}
              >
                ↓
              </Button>
              <Button variant="ghost" aria-label={recipeStrings.steps.remove} onClick={() => onChange(removeStep(steps, i))}>
                {recipeStrings.steps.remove}
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <Button variant="tonal" onClick={add}>
        {recipeStrings.steps.add}
      </Button>
    </div>
  )
}
