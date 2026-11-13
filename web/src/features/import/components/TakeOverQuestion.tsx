import type { ReactNode } from 'react'
import { takeOverText } from '../lib/baseRecipeLines'
import { importStrings as s } from '../strings'
import type { ImportTakeOverAsk } from '../types'
import { AnswerRadios, type AnswerChoice } from './AnswerRadios'

export interface TakeOverQuestionProps {
  ask: ImportTakeOverAsk
  onTakeOver: (yes: boolean) => void
}

/**
 * BR-E (P7 = B): the take-over ask in words, and Yes or No. Nothing is preselected; Yes is not offered when the Yield does not convert to the
 * Ingredient's Base Unit (the server's warning says why).
 */
export function TakeOverQuestion({ ask, onTakeOver }: TakeOverQuestionProps): ReactNode {
  const choices: AnswerChoice[] = [
    ...(ask.convertible ? [{ id: 'yes', title: s.baseRecipes.takeOverYes, checked: ask.answer === true }] : []),
    { id: 'no', title: s.baseRecipes.takeOverNo, checked: ask.answer === false },
  ]
  return (
    <div className="base-take-over">
      <p className="base-take-over__text">{takeOverText(ask)}</p>
      <AnswerRadios choices={choices} label={s.baseRecipes.takeOverQuestion(ask.name)} onChoose={(id) => onTakeOver(id === 'yes')} />
    </div>
  )
}
