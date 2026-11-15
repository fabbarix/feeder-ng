// SAFE-04: the hook runs focusFirstInvalid after commit when `submitCount` grows and `errors` is not empty. Errors that change on their
// own (the User fixing a field) never steal focus.
// Signature: useFocusFirstInvalid(formRef: RefObject<ParentNode | null>, errors: Record<string, unknown> | readonly unknown[] | null | undefined, submitCount: number): void
import { fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { TextField } from './TextField'
import { useFocusFirstInvalid } from './useFocusFirstInvalid'

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {}
})

function Form({ initial }: { initial: { name?: string; email?: string } }) {
  const ref = useRef<HTMLFormElement>(null)
  const [errors, setErrors] = useState(initial)
  const [submits, setSubmits] = useState(0)
  useFocusFirstInvalid(ref, errors, submits)
  return (
    <form ref={ref} onSubmit={(e) => e.preventDefault()}>
      <TextField label="Name" value="" onChange={() => {}} error={errors.name} />
      <TextField label="Email" value="" onChange={() => {}} error={errors.email} />
      <button type="button" onClick={() => setSubmits((n) => n + 1)}>
        Save
      </button>
      <button type="button" onClick={() => setErrors({})}>
        Fix all
      </button>
      <button type="button" onClick={() => setErrors({ email: 'Bad email.' })}>
        New error
      </button>
    </form>
  )
}
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }))

describe('useFocusFirstInvalid', () => {
  it('does nothing on mount, even with errors', () => {
    render(<Form initial={{ name: 'Enter a name.' }} />)
    expect(screen.getByLabelText('Name')).not.toHaveFocus()
  })

  it('focuses the first invalid field when a submit leaves errors', () => {
    render(<Form initial={{ name: 'Enter a name.', email: 'Bad email.' }} />)
    save()
    expect(screen.getByLabelText('Name')).toHaveFocus()
  })

  it('does not move focus when a submit leaves no errors', () => {
    render(<Form initial={{}} />)
    screen.getByRole('button', { name: 'Save' }).focus()
    save()
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus()
  })

  it('does not steal focus when the errors change without a submit (the User fixing a field)', () => {
    render(<Form initial={{}} />)
    screen.getByRole('button', { name: 'New error' }).focus()
    fireEvent.click(screen.getByRole('button', { name: 'New error' }))
    expect(screen.getByRole('button', { name: 'New error' })).toHaveFocus()
  })

  it('focuses again on the next failed submit', () => {
    render(<Form initial={{ name: 'Enter a name.' }} />)
    save()
    screen.getByRole('button', { name: 'Save' }).focus()
    save()
    expect(screen.getByLabelText('Name')).toHaveFocus()
  })

  it('takes an array of messages as errors too', () => {
    function ArrayForm() {
      const ref = useRef<HTMLDivElement>(null)
      const [n, setN] = useState(0)
      useFocusFirstInvalid(ref, ['Name is empty.'], n)
      return (
        <div ref={ref}>
          <input aria-label="Name" aria-invalid="true" />
          <button type="button" onClick={() => setN((v) => v + 1)}>
            Save
          </button>
        </div>
      )
    }
    render(<ArrayForm />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByLabelText('Name')).toHaveFocus()
  })
})
