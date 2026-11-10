import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { RecipesOverflowSheet } from './RecipesOverflowSheet'

vi.mock('../../import/hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy: vi.fn() }) }))

const view = (over: Partial<Parameters<typeof RecipesOverflowSheet>[0]> = {}) =>
  render(
    <MemoryRouter>
      <RecipesOverflowSheet open onClose={() => {}} showArchived={false} onShowArchivedChange={() => {}} {...over} />
    </MemoryRouter>,
  )

describe('RecipesOverflowSheet', () => {
  it('holds Import, Export and Copy Agent Prompt', () => {
    view()
    expect(screen.getByRole('dialog', { name: 'More' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Import/ })).toHaveAttribute('href', '/recipes/import')
    expect(screen.getByRole('link', { name: /Export/ })).toHaveAttribute('href', '/recipes/export')
    expect(screen.getByRole('button', { name: /Copy Agent Prompt/ })).toBeInTheDocument()
  })
  it('toggles "Show archived" with a Switch', async () => {
    const onShowArchivedChange = vi.fn()
    view({ onShowArchivedChange })
    const sw = screen.getByRole('switch', { name: 'Show archived' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(sw)
    expect(onShowArchivedChange).toHaveBeenCalledWith(true)
  })
  it('renders nothing while closed', () => {
    view({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
