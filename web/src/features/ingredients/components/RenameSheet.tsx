import { useId, useRef } from 'react'
import { BottomSheet, TextField } from '../../../ui'
import { FormError } from '../../../ui/fields/FormError'
import { useFocusFirstInvalid } from '../../../ui/fields/useFocusFirstInvalid'
import { useRenameForm } from '../hooks/useRenameForm'
import { displayName } from '../lib/names'
import { strings } from '../strings'
import type { IngredientKind } from '../types'
import '../ingredients.css'

export interface RenameSheetProps {
  open: boolean
  kind: IngredientKind
  /** The stored name: the field starts with it, the title shows its display form. */
  name: string
  onClose: () => void
  /** Rejects with the server refusal (name_taken shows at the field). */
  onSave: (name: string) => Promise<unknown>
}

/** SET-05: "Rename <name>": the Name field focused and selected, Cancel and "Save name" in the footer, no Close (R-B). */
export function RenameSheet({ open, kind, name, onClose, onSave }: RenameSheetProps) {
  const formId = useId()
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      onCancel={onClose}
      title={strings.renameSheet.title(displayName(name))}
      submit={{ label: strings.saveName, form: formId }}
    >
      {open ? <RenameForm formId={formId} kind={kind} name={name} onClose={onClose} onSave={onSave} /> : null}
    </BottomSheet>
  )
}

/** The form mounts fresh each time the sheet opens. */
function RenameForm({ formId, kind, name, onClose, onSave }: Omit<RenameSheetProps, 'open'> & { formId: string }) {
  const formRef = useRef<HTMLFormElement>(null)
  const selected = useRef(false)
  const form = useRenameForm(kind, name, onSave, onClose)
  useFocusFirstInvalid(formRef, { name: form.error }, form.submitCount)
  return (
    <form
      id={formId}
      ref={formRef}
      noValidate
      className="rename-sheet__form"
      onSubmit={(e) => {
        e.preventDefault()
        void form.submit()
      }}
    >
      <TextField
        label={strings.nameLabel}
        value={form.text}
        onChange={form.setText}
        helper={strings.renameSheet.helper}
        error={form.error}
        autoComplete="off"
        onFocus={(e) => {
          // The first focus (the sheet opening) selects the name, so typing replaces it.
          if (selected.current) return
          selected.current = true
          e.currentTarget.select()
        }}
      />
      <FormError>{form.failure}</FormError>
    </form>
  )
}
