// R2-4 F-04: the Scan sheets' buttons sit in FormActions (primary last, right-aligned from 600 px, full width on a phone).
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { CameraRecovery } from '../hooks/useCameraRecovery'
import { AskWeightSheet } from './AskWeightSheet'
import { ManualBarcodeEntry } from './ManualBarcodeEntry'
import { StockTakeSheet } from './StockTakeSheet'
import { UnarchiveProductSheet } from './UnarchiveProductSheet'

const inPrimary = (name: string | RegExp) => screen.getByRole('button', { name }).closest('.form-actions__primary')

describe('Scan sheets use FormActions', () => {
  it('How much does it weigh?: Save', () => {
    render(<AskWeightSheet open onClose={() => {}} productName="Ham" priceText="$2.50" onSubmit={() => {}} />)
    expect(inPrimary('Save')).not.toBeNull()
  })
  it('Unarchive: "Unarchive ..." is the primary, "Create a new Product instead" the secondary of one row', () => {
    render(<UnarchiveProductSheet open onClose={() => {}} productName="Mutti passata" onUnarchive={() => {}} onCreateNew={() => {}} />)
    expect(inPrimary(/^Unarchive/)).not.toBeNull()
    expect(screen.getByRole('button', { name: /Create a new Product instead/ }).closest('.form-actions__secondary')).not.toBeNull()
  })
  it('Stock-take set total: Save is in FormActions once the total form is open', async () => {
    render(<StockTakeSheet open onClose={() => {}} productName="Mutti passata 700 g" ingredientName="passata" currentStockText="1400 g" packText="700 g" onAction={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /set total/i }))
    expect(inPrimary('Save')).not.toBeNull()
  })
  it('Manual barcode: "Use barcode" is the primary and the cancel the tertiary', () => {
    render(<ManualBarcodeEntry recovery={{ failure: null, manualOpen: true, openManual() {}, closeManual() {}, text: '', setText() {}, error: null, submit: () => true, retry() {} } as unknown as CameraRecovery} />)
    expect(inPrimary(/Use this barcode/)).not.toBeNull()
    expect(document.querySelector('.form-actions__tertiary button')).not.toBeNull()
  })
})
