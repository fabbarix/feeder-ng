// The Tag sheet: Name, the Tag colour picker with a live pill, Save, and (editing) Merge into… and Delete Tag.
import { useState, type ReactElement } from 'react'
import { BottomSheet, Button, Chip, FormActions, TagColourPicker, TextField } from '../../../ui'
import { normaliseTagName } from '../lib/tagName'
import { tagsStrings } from '../strings'
import type { SaveResult, SheetState, TagFormValues } from '../types'
import '../tags.css'

export interface TagSheetProps {
  /** null = closed. */
  sheet: SheetState | null
  /** The colour a new Tag starts with. */
  newColour: string
  onClose: () => void
  /** Resolves ok to close; a refusal keeps the sheet and shows `error` under Name. */
  onSave: (values: TagFormValues) => Promise<SaveResult>
  /** Merge into…: only an edit sheet shows it. */
  onMerge: () => void
  /** Delete Tag: only an edit sheet shows it. */
  onDelete: () => void
  /** True while the Delete impact is loading (or a write is running): Delete Tag is disabled so a double tap cannot ask twice. */
  busy?: boolean
}

/** The Tag sheet: Name, Tag colour picker with a live pill, Save, and (editing) Merge into… and Delete Tag. */
export function TagSheet({ sheet, newColour, onClose, onSave, onMerge, onDelete, busy }: TagSheetProps): ReactElement | null {
  const title = sheet?.mode === 'edit' ? tagsStrings.sheet.editTitle : tagsStrings.sheet.addTitle
  return (
    <BottomSheet open={sheet !== null} onClose={onClose} title={title}>
      {sheet ? (
        <TagSheetForm
          key={sheet.mode === 'edit' ? `edit-${sheet.tag.id}` : 'new'}
          sheet={sheet}
          newColour={newColour}
          onSave={onSave}
          onMerge={onMerge}
          onDelete={onDelete}
          busy={busy}
        />
      ) : null}
    </BottomSheet>
  )
}

/** The form of one opening of the sheet: its state is local, so a reopened sheet starts afresh. */
function TagSheetForm({ sheet, newColour, onSave, onMerge, onDelete, busy }: Omit<TagSheetProps, 'sheet' | 'onClose'> & { sheet: NonNullable<SheetState> }) {
  const editing = sheet.mode === 'edit' ? sheet.tag : null
  const [name, setName] = useState(editing?.name ?? '')
  const [colour, setColour] = useState<string>(editing?.colour ?? newColour)
  const [error, setError] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const blank = normaliseTagName(name) === ''

  const submit = async () => {
    if (blank) return
    setSaving(true)
    const result = await onSave({ name, colour })
    setSaving(false)
    if (!result.ok) setError(result.error)
  }

  return (
    <form
      className="tag-sheet"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <TextField
        label={tagsStrings.sheet.name}
        value={name}
        error={error}
        onChange={(next) => {
          setName(next)
          setError(undefined)
        }}
      />
      <TagColourPicker
        label={tagsStrings.sheet.colour}
        helper={tagsStrings.sheet.colourHelper}
        value={colour}
        onChange={setColour}
        preview={
          <div data-testid="tag-preview">
            <Chip kind="tag" tagColour={colour}>
              {normaliseTagName(name) || tagsStrings.sheet.previewPlaceholder}
            </Chip>
          </div>
        }
      />
      <FormActions
        destructive={
          editing ? (
            <Button type="button" variant="danger-tertiary" disabled={busy} onClick={onDelete}>
              {tagsStrings.sheet.delete}
            </Button>
          ) : undefined
        }
        secondary={
          editing ? (
            <Button type="button" variant="secondary" onClick={onMerge}>
              {tagsStrings.sheet.mergeInto}
            </Button>
          ) : undefined
        }
        primary={
          <Button type="submit" variant="primary" disabled={blank} loading={saving}>
            {tagsStrings.sheet.save}
          </Button>
        }
      />
    </form>
  )
}
