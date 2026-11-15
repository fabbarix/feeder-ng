// B9-37 (RX-02): an option may show a short label and keep a longer accessible name (a Step's "Advance" is named "Advance Step").
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Segmented } from './Segmented'

describe('SegmentedOption ariaLabel', () => {
  it('names the radio by ariaLabel; the visible text stays the label', () => {
    render(
      <Segmented
        label="Kind of Step 1"
        compact
        value="active"
        onChange={() => {}}
        options={[
          { value: 'active', label: 'Active' },
          { value: 'advance', label: 'Advance', ariaLabel: 'Advance Step' },
        ]}
      />,
    )
    const radio = screen.getByRole('radio', { name: 'Advance Step' })
    expect(radio).toHaveTextContent('Advance')
    expect(screen.getByRole('radio', { name: 'Active' })).toHaveAttribute('aria-checked', 'true')
  })
})
