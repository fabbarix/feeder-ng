// B9-45 (PC-02): the Cooked moment: "Cooked, nice one!" (focused), the Recipe and meal, where the Leftover went, the children (ONE notice and its
// sheet), and the footer: the way back to where Cook Mode was opened from, and Undo Cooked. Never a danger tile.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CookedConfirmation } from './CookedConfirmation'

const planned = { kind: 'planned' as const, portions: 1.25, useBy: '2026-11-17', meals: [{ date: '2026-11-16', mealSlotName: 'Dinner', recipeName: 'Cauliflower' }] }
const base = { recipeName: 'Cauliflower al gorgonzola', mealLabel: 'Sat Dinner', outcome: planned, onLeave: () => {} }

describe('CookedConfirmation', () => {
  it('says "Cooked, nice one!" in the page heading and focuses it', () => {
    render(<CookedConfirmation {...base} />)
    const h1 = screen.getByRole('heading', { level: 1, name: 'Cooked, nice one!' })
    expect(h1).toHaveFocus()
    expect(screen.queryByRole('heading', { name: 'Marked as Cooked' })).not.toBeInTheDocument()
  })

  it('names the Recipe and the meal on one line', () => {
    render(<CookedConfirmation {...base} />)
    expect(screen.getByText('Cauliflower al gorgonzola · Sat Dinner')).toBeInTheDocument()
  })

  it('draws a 96 px success check that is decorative', () => {
    const { container } = render(<CookedConfirmation {...base} />)
    const mark = container.querySelector('.cook-confirmation__mark svg')!
    expect(mark).toHaveAttribute('width', '96')
    expect(mark).toHaveAttribute('aria-hidden', 'true')
  })

  it('shows where the Leftover went in a Leftover tile: "1.25 portions kept" / "Planned for Mon Dinner · Use by Tue"', () => {
    const { container } = render(<CookedConfirmation {...base} />)
    const tile = container.querySelector('[data-status="leftover"]')!
    expect(within(tile as HTMLElement).getByText('1.25 portions kept')).toBeInTheDocument()
    expect(within(tile as HTMLElement).getByText('Planned for Mon Dinner · Use by Tue')).toBeInTheDocument()
  })

  it('shows no Leftover tile when no Leftover was recorded', () => {
    const { container } = render(<CookedConfirmation {...base} outcome={{ kind: 'none' }} />)
    expect(container.querySelector('[data-status="leftover"]')).toBeNull()
    expect(screen.queryByText('No Leftovers')).not.toBeInTheDocument()
  })

  it('has no danger, spoil or alert anywhere: a Cooked meal is not an error page', () => {
    const { container } = render(<CookedConfirmation {...base} onUndo={() => {}} undoLabel="Undo Cooked for Sat Dinner" />)
    expect(container.querySelector('[data-status="danger"], [data-status="spoil"], [role="alert"]')).toBeNull()
  })

  it('shows its children (the one Stock notice) between the tiles and the footer', () => {
    render(
      <CookedConfirmation {...base} onUndo={() => {}} undoLabel="Undo Cooked for Sat Dinner">
        <p>Stock notice</p>
      </CookedConfirmation>,
    )
    const notice = screen.getByText('Stock notice')
    const footer = screen.getByRole('button', { name: 'Back to Today' }).closest('.cook-confirmation__actions')!
    expect(notice.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('leaves with the way back to where it was opened from: "Back to Plan", the primary button', async () => {
    const onLeave = vi.fn()
    render(<CookedConfirmation {...base} leaveLabel="Back to Plan" onLeave={onLeave} />)
    expect(screen.queryByRole('button', { name: 'Back to Today' })).not.toBeInTheDocument()
    const leave = screen.getByRole('button', { name: 'Back to Plan' })
    expect(leave).toHaveAttribute('data-variant', 'primary')
    expect(leave).toHaveAttribute('data-size', 'lg')
    await userEvent.click(leave)
    expect(onLeave).toHaveBeenCalledTimes(1)
  })

  it('says "Back to Today" without an origin, and never offers Mark as Cooked again', () => {
    render(<CookedConfirmation {...base} />)
    expect(screen.getByRole('button', { name: 'Back to Today' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark as Cooked' })).not.toBeInTheDocument()
  })

  it('offers Undo Cooked as the secondary (outlined) button, named for the meal, and calls it once', async () => {
    const onUndo = vi.fn()
    render(<CookedConfirmation {...base} onUndo={onUndo} undoLabel="Undo Cooked for Sat Dinner" />)
    const undo = screen.getByRole('button', { name: 'Undo Cooked for Sat Dinner' })
    expect(undo).toHaveAttribute('data-variant', 'secondary')
    expect(undo).toHaveTextContent('Undo Cooked')
    await userEvent.click(undo)
    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  it('has no Undo button without an Undo', () => {
    render(<CookedConfirmation {...base} />)
    expect(screen.queryByRole('button', { name: /^Undo Cooked/ })).not.toBeInTheDocument()
  })

  it('is exactly two buttons in the footer: one primary and one secondary', () => {
    render(<CookedConfirmation {...base} onUndo={() => {}} undoLabel="Undo Cooked for Sat Dinner" />)
    const actions = document.querySelector('.cook-confirmation__actions')!
    expect([...actions.querySelectorAll('button')].map((b) => b.getAttribute('data-variant'))).toEqual(['secondary', 'primary'])
  })
})
