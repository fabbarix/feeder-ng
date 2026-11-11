import { useState, type KeyboardEvent } from 'react'
import { Button } from '../../Button'
import { TextField } from '../../fields/TextField'
import { imagePickerStrings as t } from '../strings'

export interface LinkPanelProps {
  /** The problem to show on the field (its message), if any. */
  error?: string
  busy: boolean
  onSubmit: (text: string) => void
  onCancel: () => void
}

/** "Paste link": a labelled field, Use link and Cancel. The field is focused on open; Enter submits. */
export function LinkPanel({ error, busy, onSubmit, onCancel }: LinkPanelProps) {
  const [text, setText] = useState('')
  return (
    <div className="image-picker__panel">
      <TextField
        label={t.linkLabel}
        helper={t.linkHelper}
        error={error}
        value={text}
        onChange={setText}
        inputMode="url"
        autoComplete="off"
        autoFocus
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (!busy) onSubmit(text)
          }
        }}
      />
      <div className="image-picker__panel-actions">
        <Button variant="secondary" disabled={busy} onClick={() => onSubmit(text)}>
          {t.useLink}
        </Button>
        <Button variant="tertiary" disabled={busy} onClick={onCancel}>
          {t.cancel}
        </Button>
      </div>
    </div>
  )
}
