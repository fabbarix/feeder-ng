// B9-29 (SAFE-04, B9-16 patterns): the Storage Place sheet's errors.
//   - a server error that belongs to no field is <FormError> (the one role="alert", class form-error); the old `.pg__error` paragraph is gone
//   - a refusal that names a field (ApiError details.field === 'name', e.g. a name already in use) is the Name field's own error
//     (aria-invalid, described by its message, focus moves to it) and there is no alert
//   - after a failed save the person can edit and save again
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { StoragePlaceSheet } from './StoragePlaceSheet'

function setup(onSave: () => Promise<unknown>) {
  render(<StoragePlaceSheet editing="new" onClose={() => {}} onSave={onSave} />)
  const sheet = screen.getByRole('dialog', { name: 'Add Storage Place' })
  return sheet
}
const fill = async (sheet: HTMLElement) => {
  await userEvent.type(within(sheet).getByRole('textbox', { name: 'Name' }), 'Garage Freezer')
  await userEvent.click(within(sheet).getByRole('button', { name: 'Save Storage Place' }))
}

describe('StoragePlaceSheet errors', () => {
  it('a server error with no field is a FormError, and `.pg__error` is gone', async () => {
    const sheet = setup(vi.fn().mockRejectedValue(new Error('The server is busy.')))
    await fill(sheet)
    const alert = await within(sheet).findByRole('alert')
    expect(alert).toHaveTextContent('The server is busy.')
    expect(alert).toHaveClass('form-error')
    expect(sheet.querySelector('.pg__error')).toBeNull()
  })
  it('an error that names the Name field goes to that field, with focus, and is not an alert', async () => {
    const sheet = setup(vi.fn().mockRejectedValue(new ApiError(422, 'validation_failed', 'There is already a Storage Place called Garage Freezer.', { field: 'name' })))
    await fill(sheet)
    const name = within(sheet).getByRole('textbox', { name: 'Name' })
    await waitFor(() => expect(name).toHaveAttribute('aria-invalid', 'true'))
    expect(within(sheet).getByText('There is already a Storage Place called Garage Freezer.')).toBeInTheDocument()
    expect(name).toHaveFocus()
    expect(within(sheet).queryByRole('alert')).toBeNull()
  })
  it('editing the Name clears its error', async () => {
    const sheet = setup(vi.fn().mockRejectedValue(new ApiError(422, 'validation_failed', 'Name taken.', { field: 'name' })))
    await fill(sheet)
    const name = within(sheet).getByRole('textbox', { name: 'Name' })
    await waitFor(() => expect(name).toHaveAttribute('aria-invalid', 'true'))
    await userEvent.type(name, '2')
    expect(name).not.toHaveAttribute('aria-invalid', 'true')
  })
})

describe('StoragePlaceSheet: a name already in use (B9-29 developer)', () => {
  it('409 name_taken, as the server answers it (no field), is the Name field\'s own error too', async () => {
    const sheet = setup(vi.fn().mockRejectedValue(new ApiError(409, 'name_taken', 'A Storage Place with that name already exists')))
    await fill(sheet)
    const name = within(sheet).getByRole('textbox', { name: 'Name' })
    await waitFor(() => expect(name).toHaveAttribute('aria-invalid', 'true'))
    expect(within(sheet).queryByRole('alert')).toBeNull()
  })
})
