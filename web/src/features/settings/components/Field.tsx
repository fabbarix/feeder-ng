import { useId, type ReactNode } from 'react'

export interface FieldControlProps {
  id: string
  'aria-invalid'?: true
  'aria-describedby'?: string
}

export interface FieldProps {
  label: string
  error?: string
  hint?: string
  children: (control: FieldControlProps) => ReactNode
}

/** A label, a control and its hint or error, wired together for assistive technology. Shared by the settings forms. */
export function Field({ label, error, hint, children }: FieldProps) {
  const id = useId()
  const noteId = `${id}-note`
  const note = error ?? hint
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': note ? noteId : undefined })}
      {error ? (
        <p id={noteId} role="alert" className="field__error">
          {error}
        </p>
      ) : hint ? (
        <p id={noteId} className="field__hint">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
