import type { ReactNode } from 'react'
import { useId } from 'react'
import { RadioCards, type RadioCard } from '../../../ui/fields/RadioCards'
import { Tile } from '../../../ui'
import { takeOverFacts } from '../lib/baseRecipeLines'
import { importStrings as s } from '../strings'
import type { ImportTakeOverAsk } from '../types'

export interface TakeOverQuestionProps {
  ask: ImportTakeOverAsk
  onTakeOver: (yes: boolean) => void
}

/**
 * BR-E (P7 = B): the take-over ask, an info status tile: its facts, the question, and Yes or No. Nothing is preselected; Yes is not offered
 * when the Yield does not convert to the Ingredient's Base Unit (the server's warning says why). Arrows move between the answers; Space or
 * Enter answers.
 */
export function TakeOverQuestion({ ask, onTakeOver }: TakeOverQuestionProps): ReactNode {
  const questionId = useId()
  const options: RadioCard<'yes' | 'no'>[] = [
    ...(ask.convertible ? [{ value: 'yes' as const, title: s.baseRecipes.takeOverYes }] : []),
    { value: 'no' as const, title: s.baseRecipes.takeOverNo },
  ]
  const value = ask.answer === undefined ? null : ask.answer ? 'yes' : 'no'
  return (
    <Tile variant="status" status="info">
      <p className="base-take-over__text">{takeOverFacts(ask)}</p>
      <p id={questionId} className="base-take-over__text">
        {s.baseRecipes.takeOverQuestion(ask.name)}
      </p>
      <RadioCards bare labelledBy={questionId} activation="manual" options={options} value={value} onChange={(v) => onTakeOver(v === 'yes')} />
    </Tile>
  )
}
