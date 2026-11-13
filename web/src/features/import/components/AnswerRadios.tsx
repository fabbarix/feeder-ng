import type { ReactNode } from 'react'
import { useRovingRadios } from '../../../ui'

/** One answer of a crafted radio group: a title, an optional second line, and whether it is the answer in force. */
export interface AnswerChoice {
  id: string
  title: string
  detail?: string
  checked: boolean
  disabled?: boolean
}

export interface AnswerRadiosProps {
  choices: AnswerChoice[]
  /** The id of the heading that names the question (the group's accessible name). */
  labelledBy?: string
  /** The group's name, when there is no heading. */
  label?: string
  /** Ids of the Problems the group answers to. */
  describedBy?: string
  onChoose: (id: string) => void
}

/**
 * A radio group built from our own buttons (role radio): the arrows move and choose, one tab stop (the answer in force). Same look as
 * RadioCards, but it takes the ids of the Problems the group is described by. No native control (CLAUDE.md).
 */
export function AnswerRadios({ choices, labelledBy, label, describedBy, onChoose }: AnswerRadiosProps): ReactNode {
  const checked = choices.find((c) => c.checked)?.id ?? ''
  const roving = useRovingRadios(
    choices.map((c) => ({ value: c.id, disabled: c.disabled })),
    checked,
    onChoose,
  )
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} aria-label={label} aria-describedby={describedBy} className="base-answers">
      {choices.map((c) => (
        <button
          key={c.id}
          ref={roving.register(c.id)}
          type="button"
          role="radio"
          aria-checked={c.checked}
          tabIndex={c.id === roving.tabStop ? 0 : -1}
          disabled={c.disabled}
          className="radio-card base-answers__choice"
          onClick={() => onChoose(c.id)}
          onKeyDown={(e) => roving.onKeyDown(e, c.id)}
        >
          <span className="radio-card__mark" aria-hidden="true" />
          <span className="radio-card__text">
            <span className="radio-card__title">{c.title}</span>
            {c.detail ? <span className="radio-card__description">{c.detail}</span> : null}
          </span>
        </button>
      ))}
    </div>
  )
}
