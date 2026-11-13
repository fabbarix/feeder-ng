// One proposal of the review. The whole row toggles it (design 3.4): a click on its text checks the row, or opens the Add form of an
// unfinished Add. The controls inside (the checkbox, its label, the buttons) do their own job. Our Checkbox is the keyboard control.
import type { MouseEvent } from 'react'
import { Button, Checkbox, Thumb } from '../../../ui'
import { receiptStrings as t } from '../strings'
import type { ReviewRowView } from '../lib/reviewRows'

export interface ReviewRowProps {
  view: ReviewRowView
  onToggle: (id: string) => void
  onOpenAdd: (id: string) => void
}

export function ReviewRow({ view, onToggle, onOpenAdd }: ReviewRowProps) {
  // The checkbox's (visually hidden) name says the change too: one Product can have two rows (its Price and its pack size).
  const name = view.change !== '' ? `${view.title}, ${view.change}` : view.title
  const activate = () => (view.needsForm ? onOpenAdd(view.id) : onToggle(view.id))
  const onClick = (e: MouseEvent<HTMLLIElement>) => {
    if ((e.target as Element).closest('button, input, label, a')) return
    activate()
  }
  return (
    <li className="receipt-row" data-checked={view.checked ? 'true' : undefined} data-highlighted={view.highlighted ? 'true' : undefined} onClick={onClick}>
      <span className="receipt-row__check">
        <Checkbox label={name} checked={view.checked} disabled={view.checkDisabled} onChange={() => onToggle(view.id)} />
      </span>
      <Thumb name={view.title} size={40} />
      <span className="receipt-row__text">
        <span className="receipt-row__title">{view.title}</span>
        <span className="receipt-row__change">{view.change}</span>
        {view.line ? <span className="receipt-row__line">{view.line}</span> : null}
        {view.isAdd ? (
          <span className="receipt-row__actions">
            {view.ready ? <span className="receipt-row__ready">{t.ready}</span> : null}
            {view.ready ? (
              <Button variant="tertiary" size="sm" onClick={() => onOpenAdd(view.id)}>
                {t.edit}
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => onOpenAdd(view.id)}>
                {t.add}
              </Button>
            )}
          </span>
        ) : null}
        {view.isMissing ? (
          <span className="receipt-row__actions">
            <Button variant="tertiary" size="sm" onClick={() => onToggle(view.id)}>
              {view.checked ? t.undo : t.remove}
            </Button>
          </span>
        ) : null}
      </span>
      {view.value !== undefined ? (
        <span className="receipt-row__value">
          {view.value}
          {view.subValue !== undefined ? <span className="receipt-row__sub">{view.subValue}</span> : null}
        </span>
      ) : null}
    </li>
  )
}
