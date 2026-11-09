import { useId, type ReactNode } from 'react'
import '../products.css'

export interface FormFieldControl {
  id: string
  'aria-invalid'?: true
  'aria-describedby'?: string
}

export interface FormFieldProps {
  label: string
  error?: string
  hint?: string
  children: (control: FormFieldControl) => ReactNode
}

/** A label, a control and its hint or error, wired together. Shared by the Products and Shops forms. */
export function FormField({ label, error, hint, children }: FormFieldProps) {
  const id = useId()
  const noteId = `${id}-note`
  const note = error ?? hint
  return (
    <div className="form-field">
      <label htmlFor={id} className="form-field__label">
        {label}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': note ? noteId : undefined })}
      {note ? (
        <p id={noteId} className={error ? 'form-field__note form-field__note--error' : 'form-field__note'}>
          {note}
        </p>
      ) : null}
    </div>
  )
}
