// B9-53 (TB-06, decision TB 6): "Hide for now" on Today stores setupHidden; Settings > Household shows it again. A row "Setup checklist" with the state
// "Hidden from Today" and a secondary "Show on Today" (an immediate write through `onShowSetup`, not part of the form's Save). The form's own Save leaves
// setupHidden out, so the server keeps it (the same rule as Earliest start).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { householdSettings } from './fixtures'
import { HouseholdSettingsForm } from './HouseholdSettingsForm'

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}

const hidden = { ...householdSettings, setupHidden: true }
function mount(value: Record<string, unknown> = hidden, props: Record<string, unknown> = {}) {
  const h = { onSave: vi.fn(), onShowSetup: vi.fn() }
  render(<HouseholdSettingsForm value={value as never} canEdit {...h} {...props} />)
  return h
}

describe('Settings > Household: the Setup checklist row', () => {
  it('a hidden checklist has a row "Setup checklist" saying it is hidden, with "Show on Today"', async () => {
    const h = mount()
    const row = screen.getByRole('listitem', { name: /Setup checklist/ })
    expect(row).toHaveTextContent('Hidden from Today')
    const show = within(row).getByRole('button', { name: 'Show on Today' })
    expect(show).toHaveAttribute('data-variant', 'secondary')
    expect(show.querySelector('svg')).toBeNull()
    await userEvent.click(show)
    expect(h.onShowSetup).toHaveBeenCalledTimes(1)
    expect(h.onSave).not.toHaveBeenCalled()
  })

  it('a checklist that is not hidden has no row: there is nothing to show again', () => {
    mount({ ...householdSettings, setupHidden: false })
    expect(screen.queryByText('Setup checklist')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Show on Today' })).toBeNull()
  })

  it('a plain User sees no row and no button (it is an Admin setting)', () => {
    mount(hidden, { canEdit: false })
    expect(screen.queryByRole('button', { name: 'Show on Today' })).toBeNull()
  })

  it('the form\'s Save leaves setupHidden out, so a save never un-hides or hides it', async () => {
    const h = mount()
    await userEvent.click(screen.getByRole('button', { name: 'Save Household settings' }))
    expect(h.onSave).toHaveBeenCalledTimes(1)
    expect(h.onSave.mock.calls[0]![0]).not.toHaveProperty('setupHidden')
  })

  it('the row is a row (a list item with the key and the state), not a bullet sentence', () => {
    mount()
    const row = screen.getByRole('listitem', { name: /Setup checklist/ })
    expect(row.closest('ul')).not.toBeNull()
    expect(row.querySelector('.list-row__title')).toHaveTextContent('Setup checklist')
  })
})
