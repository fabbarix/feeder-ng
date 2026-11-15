// B9-48 (SAFE-04): the Unit Conversion add form reports at the FIELD: the message under Unit or under Amount, aria-invalid and
// aria-describedby on that field, focus moved to the first invalid field, no loose role=alert; a failed add (the server) is a <FormError>.
// SAFE-04 copy: Unit Conversion | Unit | "Enter a unit, for example clove." (the table's wording: with the full stop).
// Which field: blank unit or the Base Unit itself or an existing unit -> Unit; an amount that is not above 0 -> Amount.
// API addition (components/ConversionEditor.tsx): `onAdd` may return a Promise; a rejection shows its words (lib/errorMessage) as the
// form's FormError and keeps what was typed; a resolved (or void) add clears the form as before.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { ConversionEditor } from './ConversionEditor'

const garlic = [{ unit: 'clove', toBase: 5 }]
const setup = (onAdd: (c: { unit: string; toBase: number }) => unknown = vi.fn()) =>
  render(<ConversionEditor conversions={garlic} base="g" system="metric" onAdd={onAdd} onRemove={vi.fn()} />)
const unit = () => screen.getByLabelText('Unit')
const amount = () => screen.getByLabelText('Amount in g')
const add = () => screen.getByRole('button', { name: 'Add conversion' })

describe('ConversionEditor errors at the field (SAFE-04)', () => {
  it('Add with nothing: "Enter a unit, for example clove." under Unit, focus on Unit, aria-invalid, described by it, no alert', async () => {
    const onAdd = vi.fn()
    setup(onAdd)
    await userEvent.click(add())
    expect(onAdd).not.toHaveBeenCalled()
    expect(unit()).toHaveAttribute('aria-invalid', 'true')
    expect(unit()).toHaveAccessibleDescription(/Enter a unit, for example clove\./)
    expect(unit()).toHaveFocus()
    expect(screen.queryAllByRole('alert')).toEqual([])
  })
  it('a bad Amount is the Amount field\'s error, and focus goes there (not to Unit)', async () => {
    setup()
    await userEvent.type(unit(), 'bulb')
    await userEvent.type(amount(), '0')
    await userEvent.click(add())
    expect(amount()).toHaveAttribute('aria-invalid', 'true')
    expect(amount()).toHaveAccessibleDescription(/Enter an amount greater than 0/)
    expect(amount()).toHaveFocus()
    expect(unit()).not.toHaveAttribute('aria-invalid', 'true')
  })
  it('a unit the Ingredient already has, and the Base Unit itself, are Unit errors', async () => {
    setup()
    await userEvent.type(unit(), 'Clove')
    await userEvent.type(amount(), '6')
    await userEvent.click(add())
    expect(unit()).toHaveAccessibleDescription(/This Ingredient already has a conversion for that unit/)
    await userEvent.clear(unit())
    await userEvent.type(unit(), 'g')
    await userEvent.click(add())
    expect(unit()).toHaveAccessibleDescription(/That is already the Base Unit \(g\)/)
  })
  it('both fields wrong: both marked, focus on the first (Unit)', async () => {
    setup()
    await userEvent.type(amount(), 'x')
    await userEvent.click(add())
    expect(unit()).toHaveAttribute('aria-invalid', 'true')
    expect(amount()).toHaveAttribute('aria-invalid', 'true')
    expect(unit()).toHaveFocus()
  })
  it('an error clears as its field is edited; Add stays enabled throughout', async () => {
    setup()
    await userEvent.click(add())
    expect(add()).toBeEnabled()
    await userEvent.type(unit(), 'b')
    expect(unit()).not.toHaveAttribute('aria-invalid', 'true')
  })
  it('a valid add still clears the form', async () => {
    const onAdd = vi.fn()
    setup(onAdd)
    await userEvent.type(unit(), ' Bulb ')
    await userEvent.type(amount(), '50')
    await userEvent.click(add())
    expect(onAdd).toHaveBeenCalledWith({ unit: 'bulb', toBase: 50 })
    expect(unit()).toHaveValue('')
    expect(amount()).toHaveValue('')
  })
  it('a server failure is the one FormError, nothing typed is lost, and it is the only alert', async () => {
    setup(vi.fn().mockRejectedValue(new ApiError(500, 'server_error', 'boom')))
    await userEvent.type(unit(), 'bulb')
    await userEvent.type(amount(), '50')
    await userEvent.click(add())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveClass('form-error')
    expect(alert).toHaveTextContent('That did not work. Try again.')
    expect(unit()).toHaveValue('bulb')
    expect(amount()).toHaveValue('50')
  })
})
