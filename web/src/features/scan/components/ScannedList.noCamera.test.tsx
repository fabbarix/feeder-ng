// B9-35 (SSP-06): the empty state with no camera says to type the digits (prop `noCamera`); with a camera it is unchanged.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ScannedList, type ScannedListProps } from './ScannedList'

const props = (over: Partial<ScannedListProps> & { noCamera?: boolean } = {}) =>
  ({ rows: [], currency: 'USD', system: 'metric', pricingKey: null, onPrice: vi.fn(), onIncrement: vi.fn(), onDecrement: vi.fn(), onRemove: vi.fn(), ...over }) as ScannedListProps

describe('ScannedList empty state', () => {
  it('with no camera: "Nothing scanned yet" and the typing hint', () => {
    render(<ScannedList {...props({ noCamera: true })} />)
    expect(screen.getByRole('heading', { name: 'Nothing scanned yet' })).toBeInTheDocument()
    expect(screen.getByText('Type the digits under the bars. Lines to get are under To get.')).toBeInTheDocument()
    expect(screen.queryByText(/Point the camera/)).toBeNull()
  })

  it('with a camera: the hint still says to point it at a barcode', () => {
    render(<ScannedList {...props()} />)
    expect(screen.getByText('Point the camera at a barcode. Lines to get are under To get.')).toBeInTheDocument()
  })
})
