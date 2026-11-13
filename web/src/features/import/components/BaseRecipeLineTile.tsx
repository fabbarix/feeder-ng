import { useId, useState, type ReactNode } from 'react'
import { Button, Chip, Tile } from '../../../ui'
import { RadioCards, type RadioCard } from '../../../ui/fields/RadioCards'
import { BaseRecipePicker } from '../../recipes/components/BaseRecipePicker'
import type { LinkChoice } from '../../../lib/baseRecipes/useLineLink'
import { answerForLinkChoice, askForYield, problemsFor, warningsFor, type BaseRecipeRow } from '../lib/baseRecipeLines'
import { importStrings as s } from '../strings'
import type { BaseRecipeAnswer, ImportTakeOverAsk, Problem, Warning } from '../types'
import { FileYieldForm } from './FileYieldForm'
import { TakeOverQuestion } from './TakeOverQuestion'

export interface BaseRecipeLineTileProps {
  row: BaseRecipeRow
  /** The take-over ask of this line, when a Base recipe of its name meets a plain Ingredient. */
  ask?: ImportTakeOverAsk
  /** The Problems and warnings of the plan; the tile shows those of its own path. */
  problems: Problem[]
  warnings: Warning[]
  onAnswer: (answer: BaseRecipeAnswer) => void
  /** A plannable Recipe was picked: the convert dialog asks the Yield first. */
  onConvert: (recipe: { id: number; name: string }) => void
  onTakeOver: (yes: boolean) => void
}

/**
 * BR-E (design §11.3): one Base recipe line, "Is this another recipe?" with its answers as a radio group (arrows move, Space or Enter or a click
 * answers), and "Choose another" (BR-D's Base recipe picker). Answers are sent when they are chosen; nothing is linked until Confirm. A Recipe of
 * this file that is not a Base recipe asks for its Yield when the server says so.
 */
export function BaseRecipeLineTile({ row, ask, problems, warnings, onAnswer, onConvert, onTakeOver }: BaseRecipeLineTileProps): ReactNode {
  const uid = useId()
  const questionId = `${uid}-question`
  const [picking, setPicking] = useState(false)
  const ownProblems = problemsFor(row.path, problems)
  const alertIds = ownProblems.map((_, i) => `${uid}-problem-${i}`)
  const ownWarnings = warningsFor(row.path, warnings)
  const open = !row.resolved || (ask !== undefined && !ask.resolved)

  const options: RadioCard<string>[] = row.options.map((o) => ({ value: o.id, title: o.label, description: o.detail }))
  const checked = row.options.find((o) => o.selected)?.id ?? null
  const choose = (id: string) => {
    const option = row.options.find((o) => o.id === id)
    if (!option) return
    if (option.kind === 'convert' && option.recipe) onConvert(option.recipe)
    else if (option.decision) onAnswer(option.decision)
  }
  const pick = (choice: LinkChoice) => {
    setPicking(false)
    const result = answerForLinkChoice(choice)
    if (result.kind === 'convert') onConvert(result.recipe)
    else onAnswer(result.answer)
  }

  return (
    <Tile as="section" aria-label={row.reading} className="base-line-tile">
      <p className="base-line-tile__reading">{row.reading}</p>
      {open ? (
        <div className="base-line-tile__chips">
          <Chip kind="status" status="info">
            {s.baseRecipes.needsAnswer}
          </Chip>
        </div>
      ) : null}
      {ownProblems.map((p, i) => (
        <Tile key={alertIds[i]} id={alertIds[i]} variant="status" status="danger" role="alert" as="div">
          <p>{p.message}</p>
        </Tile>
      ))}
      {ownWarnings.map((w, i) => (
        <p key={`${w.code}-${i}`} className="base-line-tile__note">
          {w.message}
        </p>
      ))}
      <h3 id={questionId} className="base-line-tile__question">
        {s.baseRecipes.question}
      </h3>
      <RadioCards
        bare
        labelledBy={questionId}
        describedBy={alertIds.join(' ') || undefined}
        activation="manual"
        options={options}
        value={checked}
        onChange={choose}
      />
      {askForYield(row, ownProblems) ? (
        <FileYieldForm onSet={(amount, unit) => onAnswer({ action: 'file', recipeIndex: row.effective!.recipeIndex, yield: amount, yieldUnit: unit })} />
      ) : null}
      {ask ? <TakeOverQuestion ask={ask} onTakeOver={onTakeOver} /> : null}
      <div className="base-line-tile__actions">
        <Button variant="tertiary" onClick={() => setPicking(true)}>
          {s.baseRecipes.chooseAnother}
        </Button>
      </div>
      <BaseRecipePicker open={picking} lineName={row.name} onClose={() => setPicking(false)} onChoose={pick} />
    </Tile>
  )
}
