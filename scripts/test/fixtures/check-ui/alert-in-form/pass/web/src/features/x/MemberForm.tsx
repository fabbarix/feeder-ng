import { FormError, TextField } from '../../ui'

// A field error is not an alert: focusFirstInvalid moves focus. role="alert" in this comment is not a violation.
export function MemberForm({ name, nameError, serverError }: { name: string; nameError?: string; serverError?: string }) {
  return (
    <form>
      <TextField label="Name" value={name} onChange={() => {}} error={nameError} />
      <FormError>{serverError}</FormError>
    </form>
  )
}
