import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { setupChecklist, type SetupFacts } from '../lib/setup'
import { SetupChecklistTile } from './SetupChecklistTile'

const fresh: SetupFacts = { members: 0, mealSlots: 0, mealSlotsWithAttendance: 0, recipes: 0, plannedMeals: 0, unplannedMeals: 0 }

function setup(facts: SetupFacts = fresh, isAdmin = true) {
  const onAction = vi.fn()
  const view = render(<SetupChecklistTile checklist={setupChecklist(facts)} onAction={onAction} isAdmin={isAdmin} />)
  return { onAction, ...view }
}

describe('SetupChecklistTile: the first-run Today', () => {
  it('is a full-width soft tile that welcomes, never a failure', () => {
    const { container } = setup()
    const tile = container.querySelector('[data-span="full"]') as HTMLElement
    expect(tile).toHaveAttribute('data-variant', 'soft')
    expect(tile.querySelector('[data-status="danger"]')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Set up your Household' })).toBeInTheDocument()
    expect(screen.getByText('0 of 4 steps set up. Then the planner takes over.')).toBeInTheDocument()
  })

  it('lists the four steps in order with their one-line hints', () => {
    setup()
    const items = within(screen.getByRole('list', { name: 'Setup steps' })).getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(items[0]).toHaveTextContent('Add your Members')
    expect(items[1]).toHaveTextContent('Set up Meal Slots and attendance')
    expect(items[2]).toHaveTextContent('Add Recipes')
    expect(items[3]).toHaveTextContent('Get your first plan')
    expect(items[0]).toHaveTextContent('Everyone who eats from the plan.')
  })

  it('only the current step has an action, and it reports the step', async () => {
    const h = setup()
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toHaveAccessibleName('Add Members')
    await userEvent.click(buttons[0]!)
    expect(h.onAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'members', to: '/settings/members' }))
  })

  it('marks done steps (announced as done) and the current step (aria-current)', () => {
    setup({ ...fresh, members: 2 })
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveAttribute('data-done', 'true')
    const chip = within(items[0]!).getByText('Set up').closest('.chip')!
    expect(chip.querySelector('svg')).not.toBeNull() // a check icon
    expect(within(items[0]!).queryByText('Done')).not.toBeInTheDocument()
    expect(items[1]).toHaveAttribute('aria-current', 'step')
    expect(items[2]).not.toHaveAttribute('aria-current')
    expect(screen.getByText('1 of 4 steps set up. Then the planner takes over.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set up Meal Slots' })).toBeInTheDocument()
  })

  it('R13: Members and Meal Slots are Admin settings, so a plain User sees "Ask an Admin" instead of the button', () => {
    setup(fresh, false)
    expect(screen.queryByRole('button', { name: 'Add Members' })).not.toBeInTheDocument()
    expect(screen.getByText(/Ask an Admin/)).toBeInTheDocument()
  })

  it('R13: but Recipes are for everyone: a plain User keeps the Add a Recipe button', () => {
    setup({ ...fresh, members: 2, mealSlots: 3, mealSlotsWithAttendance: 3 }, false)
    expect(screen.getByRole('button', { name: 'Add a Recipe' })).toBeInTheDocument()
  })

  it('every step has an icon from the registry', () => {
    const { container } = setup()
    expect(container.querySelectorAll('li svg').length).toBeGreaterThanOrEqual(4)
  })

  it('renders nothing when the checklist is not visible', () => {
    const { container } = render(<SetupChecklistTile checklist={setupChecklist(null)} onAction={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
