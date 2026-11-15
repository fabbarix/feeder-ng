// B9-41 (SSP-07, Accessibility): the display's live output of a weighed row says both prices: "14.90 dollars per kg, 4.65 dollars for 312 grams".
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PriceKeypad, type PriceKeypadProps } from './PriceKeypad'

function setup(props: Partial<PriceKeypadProps> = {}) {
  return render(<PriceKeypad productName="Cheese" currency="USD" locale="en-US" shopName="Coop" hasNext={false} onNext={vi.fn()} onSave={vi.fn()} onClose={vi.fn()} pack={{ amount: 1000, unit: 'g' }} weighed={312} {...props} />)
}

describe('PriceKeypad: the spoken output of a weighed row', () => {
  it('reads the Price per kg and what the weight costs, in a polite live region', () => {
    setup({ initialPerKgCents: 1490 })
    const spoken = screen.getByText('14.90 dollars per kg, 4.65 dollars for 312 grams')
    expect(spoken.closest('[aria-live="polite"]')).not.toBeNull()
  })

  it('follows what is typed', async () => {
    setup()
    for (const k of '20') await userEvent.click(screen.getByRole('button', { name: k }))
    expect(screen.getByText('20.00 dollars per kg, 6.24 dollars for 312 grams')).toBeInTheDocument()
  })

  it('a pack Price says only the pack Price', () => {
    setup({ weighed: undefined, initialCents: 129 })
    expect(screen.queryByText(/per kg, .* for \d+ grams/)).toBeNull()
  })
})
