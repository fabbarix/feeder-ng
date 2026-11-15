// One proposal of the review, as a ListRow (DS R-E; B9-50 SSP-08): the name read as the key, the state at the row's end, the printed line
// muted under it. A row with a checkbox is toggled by the whole row; a Not scanned row has no checkbox until it is set up, and its one
// control is "Add…" (named after its printed line), which the whole row opens too. The whole-row click is ReviewSection's (one listener for
// the list); here the row only renders. Our Checkbox is the keyboard control. The button is the md size (44 px; SSP-08 asks 40 at least).
import { Button, Checkbox, Icon, ListRow, Thumb } from '../../../ui'
import { receiptStrings as t } from '../strings'
import type { ReviewRowView } from '../lib/reviewRows'

export interface ReviewRowProps {
  view: ReviewRowView
  onToggle: (id: string) => void
  onOpenAdd: (id: string) => void
}

export function ReviewRow({ view, onToggle, onOpenAdd }: ReviewRowProps) {
  const control = view.hasCheckbox ? (
    <span className="receipt-row__check">
      <Checkbox label={view.checkName} checked={view.checked} onChange={() => onToggle(view.id)} />
    </span>
  ) : undefined
  let actions = null
  if (view.isAdd) {
    actions = (
      <>
        {view.ready ? <span className="receipt-row__ready">{t.ready}</span> : null}
        <Button variant="secondary" aria-label={view.buttonName} onClick={() => onOpenAdd(view.id)}>
          {view.ready ? t.edit : t.add}
        </Button>
      </>
    )
  } else if (view.isMissing) {
    actions = (
      <Button variant="secondary" aria-label={view.buttonName} onClick={() => onToggle(view.id)}>
        {view.checked ? t.undo : t.remove}
      </Button>
    )
  }
  const detail = view.isAdd ? null : view.change
  return (
    <ListRow
      title={view.title}
      wrapTitle
      data-proposal={view.id}
      data-checked={view.checked ? 'true' : undefined}
      data-highlighted={view.highlighted ? 'true' : undefined}
      data-receipt-row={view.isAdd ? 'add' : view.isMissing ? 'missing' : 'change'}
      control={control}
      leading={<Thumb name={view.title} size={40} />}
      value={view.value}
      subValue={view.subValue}
      actions={actions}
    >
      <span className="receipt-row__details">
        {detail ? <span className="receipt-row__change">{detail}</span> : null}
        {view.line ? <span className="receipt-row__line">{view.line}</span> : null}
        {view.productMatch ? (
          <span className="receipt-row__match">
            <Icon name="link" size={14} />
            {view.productMatch}
          </span>
        ) : null}
      </span>
    </ListRow>
  )
}
