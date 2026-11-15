// B9-30 (SET-04, SET-01 decision, SAFE-04): the Barcodes tile's contents.
//   - a stored code is ONE removable Chip (Chip onRemove, its own 44 px target) named "Remove barcode <printed code>", never a Chip plus an
//     IconButton; after a removal focus moves to the next Chip, or to the Barcode field when none is left;
//   - the typed-code check (typedBarcodeError) and the server's invalid_barcode both show at the Barcode field: aria-invalid, focus,
//     the message described by the field; the field's error is not an alert;
//   - "Add barcode" is an outline button in the field's FieldRow.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { renderWithProviders } from '../../settings/test-utils'
import { ProductBarcodes } from './ProductBarcodes'

const LENGTH = 'Enter the 8, 12 or 13 digits under the bars.'
const DIGIT = "The last digit doesn't match the others. Check the number."

function Harness({ onAdd = vi.fn().mockResolvedValue(undefined), initial = ['08001505005707', '04006381333931'] }: { onAdd?: (raw: string) => Promise<void>; initial?: string[] }) {
  const [codes, setCodes] = useState(initial)
  return <ProductBarcodes barcodes={codes} shopBarcodes={[]} shops={[]} rules={[]} onAdd={onAdd} onRemove={(code) => setCodes((c) => c.filter((x) => x !== code))} />
}
const field = () => screen.getByLabelText('Barcode')

describe('removable barcode Chips', () => {
  it('each code is one button named "Remove barcode <printed code>" holding the code, with no separate remove IconButton', () => {
    renderWithProviders(<Harness />)
    const chip = screen.getByRole('button', { name: 'Remove barcode 8 001505 005707' })
    expect(chip).toHaveClass('chip')
    expect(chip).toHaveAttribute('data-removable')
    expect(chip).toHaveTextContent('8 001505 005707')
    expect(document.querySelectorAll('.icon-button')).toHaveLength(0)
  })

  it('removing a Chip calls onRemove with the stored code', async () => {
    const onRemove = vi.fn()
    renderWithProviders(<ProductBarcodes barcodes={['08001505005707']} shopBarcodes={[]} shops={[]} rules={[]} onAdd={vi.fn()} onRemove={onRemove} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove barcode 8 001505 005707' }))
    expect(onRemove).toHaveBeenCalledWith('08001505005707')
  })

  it('after a removal focus moves to the next Chip, then to the Barcode field when none is left', async () => {
    renderWithProviders(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove barcode 8 001505 005707' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /^Remove barcode 4 006381 333931/ })).toHaveFocus())
    await userEvent.click(screen.getByRole('button', { name: /^Remove barcode 4 006381 333931/ }))
    await waitFor(() => expect(field()).toHaveFocus())
    expect(screen.getByText('No barcodes')).toBeInTheDocument()
  })
})

describe('adding a barcode', () => {
  it('"Add barcode" is an outline button in the field\'s FieldRow', () => {
    renderWithProviders(<Harness />)
    const add = screen.getByRole('button', { name: 'Add barcode' })
    expect(add).toHaveAttribute('data-variant', 'secondary')
    expect(add.closest('.field-row')).toBe(field().closest('.field-row'))
  })

  it('"123" is refused at the field: invalid, focused, described by the message; nothing is sent', async () => {
    const onAdd = vi.fn()
    renderWithProviders(<Harness onAdd={onAdd} />)
    await userEvent.type(field(), '123')
    await userEvent.click(screen.getByRole('button', { name: 'Add barcode' }))
    expect(field()).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(field()).toHaveFocus())
    const message = screen.getByText(LENGTH)
    expect(field().getAttribute('aria-describedby') ?? '').toContain(message.id)
    expect(document.querySelector('.form-error')).toBeNull()
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('a wrong check digit says so', async () => {
    renderWithProviders(<Harness />)
    await userEvent.type(field(), '4006381333932')
    await userEvent.click(screen.getByRole('button', { name: 'Add barcode' }))
    expect(screen.getByText(DIGIT)).toBeInTheDocument()
  })

  it('an empty field asks for the digits', async () => {
    renderWithProviders(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Add barcode' }))
    expect(screen.getByText(LENGTH)).toBeInTheDocument()
  })

  it('the error clears as the code is typed', async () => {
    renderWithProviders(<Harness />)
    await userEvent.type(field(), '123')
    await userEvent.click(screen.getByRole('button', { name: 'Add barcode' }))
    await userEvent.type(field(), '4')
    expect(screen.queryByText(LENGTH)).toBeNull()
    expect(field()).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('a valid code and a Shop\'s own code with letters are sent trimmed, and the field empties', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    renderWithProviders(<Harness onAdd={onAdd} />)
    await userEvent.type(field(), ' 4006381333931 ')
    await userEvent.click(screen.getByRole('button', { name: 'Add barcode' }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('4006381333931'))
    await waitFor(() => expect(field()).toHaveValue(''))
    await userEvent.type(field(), 'PRIVATE-77')
    await userEvent.click(screen.getByRole('button', { name: 'Add barcode' }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('PRIVATE-77'))
  })

  it('the server\'s 400 invalid_barcode shows our copy at the field', async () => {
    const onAdd = vi.fn().mockRejectedValue(new ApiError(400, 'invalid_barcode', 'barcode must have 8, 12, 13 or 14 digits'))
    renderWithProviders(<Harness onAdd={onAdd} />)
    await userEvent.type(field(), '4006381333931')
    await userEvent.click(screen.getByRole('button', { name: 'Add barcode' }))
    expect(await screen.findByText(LENGTH)).toBeInTheDocument()
    expect(field()).toHaveAttribute('aria-invalid', 'true')
    expect(field()).toHaveValue('4006381333931')
  })

  it('another server message (a barcode owned by another Product) shows at the field too', async () => {
    const onAdd = vi.fn().mockRejectedValue(new ApiError(409, 'barcode_taken', 'That barcode belongs to Butter.'))
    renderWithProviders(<Harness onAdd={onAdd} />)
    await userEvent.type(field(), '4006381333931')
    await userEvent.click(screen.getByRole('button', { name: 'Add barcode' }))
    expect(await within(field().closest('.ui-field')!).findByText('That barcode belongs to Butter.')).toBeInTheDocument()
  })
})
