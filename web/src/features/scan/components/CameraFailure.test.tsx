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

describe('CameraFailure', () => {
  it('renders nothing while the camera works', () => {
    const { container } = render(<CameraFailure recovery={recovery({ failure: null })} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the message with the retry and type-the-barcode buttons', () => {
    const r = recovery()
    render(<CameraFailure recovery={r} />)
    expect(screen.getByText(scanStrings.cameraDenied)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: scanStrings.retryCamera }))
    expect(r.retry).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: scanStrings.enterBarcode }))
    expect(r.openManual).toHaveBeenCalled()
  })

  it('offers no retry when the browser cannot open a camera, only manual entry', () => {
    render(<CameraFailure recovery={recovery({ failure: failure('unsupported', false) })} />)
    expect(screen.queryByRole('button', { name: scanStrings.retryCamera })).toBeNull()
    expect(screen.getByRole('button', { name: scanStrings.enterBarcode })).toBeInTheDocument()
  })

  it('the manual entry has a labelled text field (not a native number control), a submit and a way back', () => {
    const r = recovery({ manualOpen: true, text: '8000500310427' })
    render(<CameraFailure recovery={r} />)
    const field = screen.getByLabelText(scanStrings.manualBarcodeLabel)
    expect(field).toHaveValue('8000500310427')
    expect(field).not.toHaveAttribute('type', 'number')
    fireEvent.change(field, { target: { value: '8000500310428' } })
    expect(r.setText).toHaveBeenCalledWith('8000500310428')
    fireEvent.click(screen.getByRole('button', { name: scanStrings.useBarcode }))
    expect(r.submit).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: scanStrings.closeManual }))
    expect(r.closeManual).toHaveBeenCalled()
  })

  it('shows why a typed barcode was refused, as an alert', () => {
    render(<CameraFailure recovery={recovery({ manualOpen: true, error: 'check_digit' })} />)
    expect(screen.getByRole('alert')).toHaveTextContent(scanStrings.manualBarcodeError.check_digit)
  })
})
