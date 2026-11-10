// R11a: StepperField (web/src/ui/fields/StepperField.tsx): a Stepper with a VISIBLE label and helper line, associated for
// assistive technology. The bare "- 1 +" in the Member sheet was an unlabelled Stepper.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StepperField } from './StepperField'

const props = { label: 'Portion Factor', helper: 'How much of a standard portion this Member eats.', min: 0.25, max: 3, step: 0.25 }

describe('StepperField', () => {
  it('shows the label and helper as text on the page', () => {
    render(<StepperField {...props} value={1} onChange={() => {}} />)
    expect(screen.getByText('Portion Factor')).toBeVisible()
    expect(screen.getByText('How much of a standard portion this Member eats.')).toBeVisible()
  })

  it('the group and the spinbutton are named by the label and described by the helper', () => {
    render(<StepperField {...props} value={1} onChange={() => {}} />)
    const helper = screen.getByText(/standard portion/)
    expect(screen.getByRole('group', { name: 'Portion Factor' })).toHaveAttribute('aria-describedby', helper.id)
    const spin = screen.getByRole('spinbutton', { name: 'Portion Factor' })
    expect(spin).toHaveAttribute('aria-describedby', helper.id)
    expect(spin).toHaveAttribute('aria-valuenow', '1')
  })

  it('keeps the Stepper behaviour: buttons named from the label, bounds, step', async () => {
    const onChange = vi.fn()
    render(<StepperField {...props} value={0.25} onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'Decrease Portion Factor' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Increase Portion Factor' }))
    expect(onChange).toHaveBeenCalledWith(0.5)
  })

  it('shows an error line when given one', () => {
    render(<StepperField {...props} value={1} error="Too many." onChange={() => {}} />)
    expect(screen.getByText('Too many.')).toBeInTheDocument()
  })
})
