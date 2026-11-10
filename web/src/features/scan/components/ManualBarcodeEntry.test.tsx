import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CameraRecovery } from '../hooks/useCameraRecovery'
import { ManualBarcodeEntry } from './ManualBarcodeEntry'

const recovery: CameraRecovery = {
  failure: null,
  manualOpen: true,
  openManual: vi.fn(),
  closeManual: vi.fn(),
  text: '',
  setText: vi.fn(),
  error: null,
  submit: vi.fn(() => true),
  retry: vi.fn(),
}

describe('ManualBarcodeEntry', () => {
  it('the field stack is a form with the scan-sheet-form class (CSS contract)', () => {
    const { container } = render(<ManualBarcodeEntry recovery={recovery} />)
    expect(container.querySelector('form')).toHaveClass('scan-sheet-form')
  })
})
