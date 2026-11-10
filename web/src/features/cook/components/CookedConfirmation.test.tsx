import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CookedConfirmation } from './CookedConfirmation'

describe('CookedConfirmation (B13)', () => {
  it('confirms the Recipe is Cooked and says where the Leftover went', () => {
    render(<CookedConfirmation recipeName="Chicken" outcomeText="2 portions planned for Tue Dinner" onLeave={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Marked as Cooked' })).toBeInTheDocument()
    expect(screen.getByText('Chicken')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('2 portions planned for Tue Dinner')
  })

  it('leaves with "Back to Today" and never offers Mark as Cooked again', async () => {
    const onLeave = vi.fn()
    render(<CookedConfirmation recipeName="Chicken" outcomeText="No Leftovers" onLeave={onLeave} />)
    expect(screen.queryByRole('button', { name: 'Mark as Cooked' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Back to Today' }))
    expect(onLeave).toHaveBeenCalledTimes(1)
  })

  it('shows its children (Stock notices) under the outcome', () => {
    render(
      <CookedConfirmation recipeName="Chicken" outcomeText="No Leftovers" onLeave={() => {}}>
        <p>Stock notice</p>
      </CookedConfirmation>,
    )
    expect(screen.getByText('Stock notice')).toBeInTheDocument()
  })

  it('restyle: a success status tile with the CheckCircle icon and a primary 56 px Back to Today', () => {
    const { container } = render(<CookedConfirmation recipeName="Chicken" outcomeText="No Leftovers" onLeave={() => {}} />)
    expect(container.querySelector('[data-variant="status"][data-status="success"]')).not.toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Back to Today' })).toHaveAttribute('data-size', 'lg')
  })
})
