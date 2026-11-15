// B9-35 (SSP-06): CameraFailure is the camera bar, rendered where the viewfinder was: a 56 px ViewfinderStrip size="bar" with the reason
// (once, as an alert) and Try again at its end. The typed entry is no longer inside it (ScanScreen puts ManualBarcodeEntry under the bar).
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CameraRecovery } from '../hooks/useCameraRecovery'
import { scanStrings } from '../strings'
import { CameraFailure } from './CameraFailure'

const s = scanStrings as unknown as Record<string, string>
const failure = (status: 'denied' | 'unsupported' | 'no_camera', canRetry: boolean, message: string) => ({ status, canRetry, message })

function recovery(over: Partial<CameraRecovery> = {}): CameraRecovery {
  return {
    failure: failure('denied', true, s.cameraBarDenied!),
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

describe('CameraFailure (the camera bar)', () => {
  it('renders nothing while the camera works', () => {
    const { container } = render(<CameraFailure recovery={recovery({ failure: null })} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('is the "Scanner" region at size bar: the viewfinder collapsed, with no picture', () => {
    const { container } = render(<CameraFailure recovery={recovery()} />)
    const region = screen.getByRole('region', { name: 'Scanner' })
    expect(region).toHaveAttribute('data-size', 'bar')
    expect(container.querySelector('video, .viewfinder-strip__picture, .viewfinder-strip__reticle')).toBeNull()
  })

  it('says the reason once, as the bar\'s alert: "Feeder may not use the camera" when it is blocked', () => {
    render(<CameraFailure recovery={recovery()} />)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert')).toHaveTextContent('Feeder may not use the camera')
  })

  it('says "No camera on this device" when there is none', () => {
    render(<CameraFailure recovery={recovery({ failure: failure('no_camera', true, s.noCameraBar!) })} />)
    expect(screen.getByRole('alert')).toHaveTextContent('No camera on this device')
  })

  it('"Try again" is an outlined secondary button (R-A) that retries the camera, on one line', () => {
    const r = recovery()
    render(<CameraFailure recovery={r} />)
    const retry = screen.getByRole('button', { name: 'Try again' })
    expect(retry).toHaveAttribute('data-variant', 'secondary')
    expect(retry).toHaveAttribute('data-one-line')
    expect(within(screen.getByRole('region', { name: 'Scanner' })).getByRole('button', { name: 'Try again' })).toBe(retry)
    fireEvent.click(retry)
    expect(r.retry).toHaveBeenCalledTimes(1)
  })

  it('offers no Try again when the browser cannot open a camera at all', () => {
    render(<CameraFailure recovery={recovery({ failure: failure('unsupported', false, s.noCameraBar!) })} />)
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent('No camera on this device')
  })

  it('has no typed entry and no "Type the barcode instead" button: the entry is the screen\'s, under the bar', () => {
    render(<CameraFailure recovery={recovery({ manualOpen: true })} />)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /type the barcode instead/i })).toBeNull()
  })
})
