// B9-35 (SSP-06): ManualBarcodeEntry is the one-row typed entry: the Barcode field and "Use" (primary, arrow, named "Use this barcode"),
// under the camera bar or under the strip. After Use the field is cleared by the recovery and keeps focus, so several codes can be typed.
// New props: `onBack` ("Back to the camera", only while a camera exists), `id` (aria-controls of Type a barcode).
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { CameraRecovery } from '../hooks/useCameraRecovery'
import { ManualBarcodeEntry } from './ManualBarcodeEntry'

function makeRecovery(over: Partial<CameraRecovery> = {}): CameraRecovery {
  return {
    failure: null,
    manualOpen: true,
    openManual: vi.fn(),
    closeManual: vi.fn(),
    text: '',
    setText: vi.fn(),
    error: null,
    submit: vi.fn(() => true),
    retry: vi.fn(),
    ...over,
  }
}

/** A recovery whose text is really kept, as the hook does (submit clears it when the code is good). */
function Live({ accept = true, onBack }: { accept?: boolean; onBack?: () => void }) {
  const [text, setText] = useState('')
  const recovery = makeRecovery({
    text,
    setText,
    submit: vi.fn(() => {
      if (accept) setText('')
      return accept
    }),
  })
  return <ManualBarcodeEntry recovery={recovery} onBack={onBack} />
}

describe('ManualBarcodeEntry', () => {
  it('the typed entry is one form, scan-sheet-form (CSS contract) and typed-entry, marked data-typed-entry for the guard', () => {
    const { container } = render(<ManualBarcodeEntry recovery={makeRecovery()} />)
    const form = container.querySelector('form')!
    expect(form).toHaveClass('scan-sheet-form')
    expect(form).toHaveClass('typed-entry')
    expect(form).toHaveAttribute('data-typed-entry')
  })

  it('takes the id Type a barcode controls', () => {
    const { container } = render(<ManualBarcodeEntry recovery={makeRecovery()} id="typed-entry" />)
    expect(container.querySelector('form')).toHaveAttribute('id', 'typed-entry')
  })

  it('the Barcode field has the chapter helper and a numeric keypad (not a number control)', () => {
    render(<ManualBarcodeEntry recovery={makeRecovery()} />)
    const field = screen.getByRole('textbox', { name: 'Barcode' })
    expect(field).toHaveAttribute('inputmode', 'numeric')
    expect(field).not.toHaveAttribute('type', 'number')
    expect(screen.getByText('The digits under the bars. Press Use for each one.')).toBeInTheDocument()
  })

  it('"Use" is the primary: the visible word "Use", an arrow, and the accessible name "Use this barcode" (label in name holds)', () => {
    const { container } = render(<ManualBarcodeEntry recovery={makeRecovery()} />)
    const use = screen.getByRole('button', { name: 'Use this barcode' })
    expect(use).toHaveAttribute('data-variant', 'primary')
    expect(use).toHaveAttribute('type', 'submit')
    expect(use).toHaveAttribute('data-one-line')
    expect(use).toHaveTextContent(/^Use$/)
    expect(use.querySelector('svg')).not.toBeNull()
    expect(container.querySelectorAll('button[data-variant="primary"]')).toHaveLength(1)
  })

  it('the field and Use are one row: no FormActions around them', () => {
    const { container } = render(<ManualBarcodeEntry recovery={makeRecovery()} />)
    expect(container.querySelector('.form-actions')).toBeNull()
  })

  it('submits through the recovery, on the button and on Enter', async () => {
    const r = makeRecovery({ text: '8000500310427' })
    render(<ManualBarcodeEntry recovery={r} />)
    await userEvent.click(screen.getByRole('button', { name: 'Use this barcode' }))
    expect(r.submit).toHaveBeenCalledTimes(1)
    fireEvent.submit(screen.getByRole('textbox', { name: 'Barcode' }).closest('form')!)
    expect(r.submit).toHaveBeenCalledTimes(2)
  })

  it('after Use the field is empty and still has focus, ready for the next code', async () => {
    render(<Live />)
    const field = screen.getByRole('textbox', { name: 'Barcode' })
    await userEvent.type(field, '8000500310427')
    expect(field).toHaveValue('8000500310427')
    await userEvent.click(screen.getByRole('button', { name: 'Use this barcode' }))
    expect(field).toHaveValue('')
    expect(field).toHaveFocus()
    await userEvent.type(field, '8000500310434{Enter}')
    expect(field).toHaveValue('')
    expect(field).toHaveFocus()
  })

  it('a refused code leaves the field focused too (the error is on the field)', async () => {
    render(<Live accept={false} />)
    const field = screen.getByRole('textbox', { name: 'Barcode' })
    await userEvent.type(field, '123')
    await userEvent.click(screen.getByRole('button', { name: 'Use this barcode' }))
    expect(field).toHaveFocus()
  })

  it('shows why a typed barcode was refused, on the field (aria-invalid, aria-describedby)', () => {
    render(<ManualBarcodeEntry recovery={makeRecovery({ error: 'check_digit' })} />)
    const field = screen.getByRole('textbox', { name: 'Barcode' })
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(document.getElementById(field.getAttribute('aria-describedby')!.split(' ').pop()!)).toHaveTextContent('That barcode looks mistyped')
  })

  it('"Back to the camera" appears only when the screen says a camera exists (onBack), and calls it', async () => {
    const { rerender } = render(<ManualBarcodeEntry recovery={makeRecovery()} />)
    expect(screen.queryByRole('button', { name: 'Back to the camera' })).toBeNull()
    const onBack = vi.fn()
    rerender(<ManualBarcodeEntry recovery={makeRecovery()} onBack={onBack} />)
    const back = screen.getByRole('button', { name: 'Back to the camera' })
    expect(back).toHaveAttribute('data-variant', 'secondary')
    expect(back).toHaveAttribute('data-one-line')
    await userEvent.click(back)
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
