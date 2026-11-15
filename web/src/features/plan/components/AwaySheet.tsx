// B9-46 (PC-08): the Away sheet. A dialog from 768 px. Opened from a Meal Slot ("Someone is away…", Who pills), from the Member
// sheet (the Member is fixed) or to edit an Away. Rendering and wiring only: hooks/useAwaySheet holds the form, the dry run and the writes.
import { useId, useRef, type ReactNode } from 'react'
import { BottomSheet, Button, DateField, DetailList, DetailRow, Select, Switch } from '../../../ui'
import { Disclosure } from '../../../ui/Disclosure'
import { useFocusFirstInvalid } from '../../../ui/fields/useFocusFirstInvalid'
import { useAwaySheet, useAwaySheetData, type AwayPreviewState, type AwaySheetData, type AwaySheetTarget } from '../hooks/useAwaySheet'
import { awayStrings } from '../strings/away'
import type { Away } from '../types'
import { AwayWhoPills } from './AwayWhoPills'
import '../plan.css'

const s = awayStrings.away

export interface AwaySheetProps {
  open: boolean
  /** The Member the sheet is for (opened from the Member sheet): the title reads "<Name> is away" and there are no Who pills. */
  memberId?: number
  /** Opened from a Meal Slot: the first Meal Slot missed. */
  from?: { date: string; mealSlotId: number }
  /** Editing this Away. */
  away?: Away
  onClose: () => void
}

export function AwaySheet({ open, onClose, ...target }: AwaySheetProps): ReactNode {
  const data = useAwaySheetData(open)
  if (!open || !data.ready) return null
  return <AwayForm target={target} data={data} onClose={onClose} />
}

function AwayForm({ target, data, onClose }: { target: AwaySheetTarget; data: AwaySheetData; onClose: () => void }): ReactNode {
  const sheet = useAwaySheet(target, data, onClose)
  const formId = useId()
  const formRef = useRef<HTMLFormElement>(null)
  useFocusFirstInvalid(formRef, sheet.errors, sheet.refusals)
  const { draft, errors } = sheet
  return (
    <BottomSheet
      open
      onClose={onClose}
      onCancel={onClose}
      title={sheet.title}
      context={sheet.context ?? undefined}
      submit={{ label: sheet.footer.save, form: formId, disabled: !sheet.canSave, loading: sheet.busy }}
      footer={
        sheet.footer.extra ? (
          <Button variant="secondary" data-one-line="" aria-label={sheet.extraName ?? undefined} disabled={sheet.busy} onClick={() => void sheet.extra()}>
            {sheet.footer.extra === 'end' ? s.endToday : s.remove}
          </Button>
        ) : undefined
      }
    >
      <form
        ref={formRef}
        id={formId}
        className="away-sheet"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void sheet.save()
        }}
      >
        {sheet.chooseWho ? <AwayWhoPills label={s.who} members={sheet.members} value={draft.memberId} onChange={sheet.setMember} /> : null}
        <div className="away-sheet__when" data-one={draft.noLastDay ? 'true' : undefined}>
          <div className="away-sheet__end">
            <DateField label={s.firstDay} value={draft.from} onChange={sheet.setFirstDay} min={sheet.started ? undefined : sheet.today} today={sheet.today} disabled={sheet.started} error={errors.first} />
            {sheet.fromOptions.length > 0 ? (
              <Select label={s.fromSlot} options={sheet.fromOptions} value={sheet.fromValue} onChange={sheet.setFromSlot} disabled={sheet.started} error={errors.fromSlot} />
            ) : null}
          </div>
          {draft.noLastDay ? null : (
            <div className="away-sheet__end">
              <DateField label={s.lastDay} value={draft.through} onChange={sheet.setLastDay} rangeStart={draft.from} today={sheet.today} error={errors.last} />
              {sheet.throughOptions.length > 0 ? (
                <Select label={s.throughSlot} options={sheet.throughOptions} value={sheet.throughValue} onChange={sheet.setThroughSlot} error={errors.throughSlot} />
              ) : null}
            </div>
          )}
        </div>
        <Switch label={s.noLastDay} description={sheet.staysAway} checked={draft.noLastDay} onChange={sheet.setNoLastDay} />
        <AwayChanges preview={sheet.preview} />
      </form>
    </BottomSheet>
  )
}

/**
 * B9-46 (PC-08): "What changes", the dry run of the Away as a collapsed info-tone disclosure (the shared Disclosure): its summary row
 * ("9 Meal Slots without Ben · 6 meals change"), and when opened R-E rows by day, then Unchanged, then the note past the plan.
 */
function AwayChanges({ preview }: { preview: AwayPreviewState }): ReactNode {
  const id = useId()
  if (preview.status === 'none') return null
  const title = preview.status === 'ready' ? preview.model.summary : preview.status === 'loading' ? s.checking : s.previewFailed
  const model = preview.status === 'ready' ? preview.model : null
  return (
    <div className="away-sheet__changes" aria-busy={preview.status === 'loading' || undefined}>
      <Disclosure id={`away-changes-${id.replace(/:/g, '')}`} title={title} level={3}>
        {model && model.rows.length > 0 ? (
          <DetailList tone="info" fill="surface">
            {model.rows.map((row) => (
              <DetailRow key={row.key} label={row.key} state={row.state} detail={row.detail} />
            ))}
          </DetailList>
        ) : null}
        {model?.note ? <p className="away-sheet__note">{model.note}</p> : null}
      </Disclosure>
    </div>
  )
}
