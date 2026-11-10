import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CameraRecovery } from '../hooks/useCameraRecovery'
import { scanStrings } from '../strings'
import { CameraFailure } from './CameraFailure'

const failure = (status: 'denied' | 'unsupported', canRetry: boolean) => ({ status, canRetry, message: status === 'denied' ? scanStrings.cameraDenied : scanStrings.cameraUnsupported })

function recovery(over: Partial<CameraRecovery> = {}): CameraRecovery {
  return {
    failure: failure('denied', true),
    manualOpen: false,
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

describe('CameraFailure (B4 UI, built on ErrorState / TextField / Button)', () => {
  it('renders nothing while the camera works', () => {
    const { container } = render(<CameraFailure recovery={recovery({ failure: null })} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the reason in an ErrorState with "Try the camera again" as its action', () => {
    const r = recovery()
    render(<CameraFailure recovery={r} />)
    expect(screen.getByRole('alert')).toHaveTextContent(scanStrings.cameraDenied)
    fireEvent.click(screen.getByRole('button', { name: scanStrings.retryCamera }))
    expect(r.retry).toHaveBeenCalled()
  })

  it('offers typing the barcode as a secondary Button with an icon', () => {
    const r = recovery()
    render(<CameraFailure recovery={r} />)
    const type = screen.getByRole('button', { name: scanStrings.enterBarcode })
    expect(type).toHaveAttribute('data-variant', 'secondary')
    fireEvent.click(type)
    expect(r.openManual).toHaveBeenCalled()
  })

  it('offers no retry when the browser cannot open a camera, only manual entry', () => {
    render(<CameraFailure recovery={recovery({ failure: failure('unsupported', false) })} />)
    expect(screen.queryByRole('button', { name: scanStrings.retryCamera })).toBeNull()
    expect(screen.getByRole('button', { name: scanStrings.enterBarcode })).toBeInTheDocument()
  })

  it('the manual entry is a TextField with a numeric keypad (not a number control), a primary submit and a way back', () => {
    const r = recovery({ manualOpen: true, text: '8000500310427' })
    render(<CameraFailure recovery={r} />)
    const field = screen.getByRole('textbox', { name: scanStrings.manualBarcodeLabel })
    expect(field).toHaveValue('8000500310427')
    expect(field).toHaveAttribute('inputmode', 'numeric')
    expect(field).not.toHaveAttribute('type', 'number')
    expect(screen.getByText(scanStrings.manualBarcodeHint)).toBeInTheDocument()
    fireEvent.change(field, { target: { value: '8000500310428' } })
    expect(r.setText).toHaveBeenCalledWith('8000500310428')
    const use = screen.getByRole('button', { name: scanStrings.useBarcode })
    expect(use).toHaveAttribute('data-variant', 'primary')
    fireEvent.click(use)
    expect(r.submit).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: scanStrings.closeManual }))
    expect(r.closeManual).toHaveBeenCalled()
  })

  it('submits on Enter', () => {
    const r = recovery({ manualOpen: true, text: '8000500310427' })
    render(<CameraFailure recovery={r} />)
    fireEvent.submit(screen.getByRole('textbox', { name: scanStrings.manualBarcodeLabel }).closest('form')!)
    expect(r.submit).toHaveBeenCalledTimes(1)
  })

  it('shows why a typed barcode was refused, on the field (aria-invalid, aria-describedby)', () => {
    render(<CameraFailure recovery={recovery({ manualOpen: true, error: 'check_digit' })} />)
    const field = screen.getByRole('textbox', { name: scanStrings.manualBarcodeLabel })
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(document.getElementById(field.getAttribute('aria-describedby')!.split(' ').pop()!)).toHaveTextContent(scanStrings.manualBarcodeError.check_digit)
  })
})
