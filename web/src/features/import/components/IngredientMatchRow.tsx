import { useState, type ReactNode } from 'react'
import { Button, ChoiceChip, ListRow, NumberField, TextField, Thumb } from '../../../ui'
import { displayName } from '../../ingredients/lib/names'
import { parseToBase } from '../lib/decisions'
import { ingredientRowId, ingredientRowMeta, ingredientRowState } from '../lib/reviewSummary'
import { importStrings as s } from '../strings'
import type { BaseUnit, IngredientMatch, UnitPrompt } from '../types'
import { RowState } from './RowState'
import { RowTitle } from './RowTitle'

export interface IngredientMatchRowProps {
  match: IngredientMatch
  /** The unit question of this Ingredient that is still open, if any (asked on the row, RX-12). */
  prompt?: UnitPrompt
  onUseExisting: (ingredientId: number) => void
  onCreate: (opts?: { name?: string; baseUnit?: BaseUnit }) => void
  onAnswerConversion: (unit: string, toBase: number) => void
}

const baseUnits: BaseUnit[] = ['g', 'ml', 'piece']
const t = s.reviewRows

/**
 * B9-28 (RX-12): an Ingredient of the file as an R-E row: its display name and monogram, the state at the end, the detail under the name,
 * and the answer controls in the row's footer (suggestion chips, base unit chips, the Base unit conflict's answers, or the unit question).
 */
export function IngredientMatchRow({ match, prompt, onUseExisting, onCreate, onAnswerConversion }: IngredientMatchRowProps): ReactNode {
  const name = displayName(match.name)
  const state = ingredientRowState(match, prompt)
  const footer = <Answers match={match} prompt={prompt} onUseExisting={onUseExisting} onCreate={onCreate} onAnswerConversion={onAnswerConversion} />
  const asks = state.tone === 'info'
  const hasAnswers = prompt !== undefined || match.status === 'suggested' || match.status === 'undefined' || (match.status === 'conflict' && match.match !== undefined)
  return (
    <ListRow
      title={<RowTitle question={ingredientRowId(match.key)}>{name}</RowTitle>}
      leading={<Thumb name={name} size={40} />}
      meta={ingredientRowMeta(match, prompt) || undefined}
      metaStatus={asks ? 'info' : undefined}
      metaIcon={asks ? 'question' : undefined}
      wrapTitle
      trailing={<RowState state={state} />}
      footer={hasAnswers ? footer : undefined}
      data-row="ingredient"
    />
  )
}

function Answers({ match, prompt, onUseExisting, onCreate, onAnswerConversion }: IngredientMatchRowProps): ReactNode {
  const name = displayName(match.name)
  if (prompt) return <UnitQuestion prompt={prompt} onAnswer={(toBase) => onAnswerConversion(prompt.unit, toBase)} />
  if (match.status === 'undefined') {
    const chosen = match.effective?.action === 'create' ? match.effective.baseUnit : undefined
    return (
      <div className="import-row__answers" role="group" aria-label={t.baseUnitGroup(name)}>
        {baseUnits.map((u) => (
          <ChoiceChip key={u} pressed={chosen === u} icon={chosen === u ? 'tick' : undefined} onClick={() => onCreate({ baseUnit: u })}>
            {u}
          </ChoiceChip>
        ))}
      </div>
    )
  }
  if (match.status === 'conflict' && match.match) {
    const existing = match.match
    return (
      <div className="import-row__answers import-row__answers--conflict">
        <ChoiceChip
          pressed={match.effective?.action === 'use'}
          icon={match.effective?.action === 'use' ? 'tick' : undefined}
          onClick={() => onUseExisting(existing.id)}
        >
          {s.useExisting(displayName(existing.name))}
        </ChoiceChip>
        <NewName onCreate={onCreate} />
      </div>
    )
  }
  if (match.status === 'suggested') {
    const e = match.effective
    return (
      <div className="import-row__answers" role="group" aria-label={t.answerGroup(name)}>
        {match.suggestions.map((x) => {
          const on = e?.action === 'use' && e.ingredientId === x.id
          return (
            <ChoiceChip key={x.id} pressed={on} icon={on ? 'tick' : undefined} onClick={() => onUseExisting(x.id)}>
              {s.useExisting(displayName(x.name))}
            </ChoiceChip>
          )
        })}
        <ChoiceChip pressed={e?.action === 'create'} icon={e?.action === 'create' ? 'tick' : undefined} onClick={() => onCreate()}>
          {t.createNamed(name)}
        </ChoiceChip>
      </div>
    )
  }
  return null
}

/** The Base unit conflict's other answer: a new name and a secondary Create, disabled while the name is blank. */
function NewName({ onCreate }: { onCreate: IngredientMatchRowProps['onCreate'] }): ReactNode {
  const [name, setName] = useState('')
  const trimmed = name.trim()
  return (
    <span className="import-row__new-name">
      <TextField size="sm" label={s.newNameLabel} value={name} onChange={setName} />
      <Button variant="secondary" disabled={trimmed === ''} onClick={() => onCreate({ name: trimmed })}>
        {t.create}
      </Button>
    </span>
  )
}

/** "1 tbsp of Garam masala is [ ] g" and Save, enabled for a number above 0. */
function UnitQuestion({ prompt, onAnswer }: { prompt: UnitPrompt; onAnswer: (toBase: number) => void }): ReactNode {
  const [value, setValue] = useState<number | null>(null)
  const toBase = parseToBase(value === null ? '' : String(value))
  return (
    <span className="import-row__unit">
      <NumberField size="xs" hideStepper label={t.unitField(prompt.unit, displayName(prompt.ingredient))} unit={prompt.base} value={value} onChange={setValue} />
      <Button variant="secondary" disabled={toBase === null} onClick={() => toBase !== null && onAnswer(toBase)}>
        {s.saveConversion}
      </Button>
    </span>
  )
}
