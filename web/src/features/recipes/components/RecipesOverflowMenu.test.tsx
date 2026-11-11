// R2-1 (G-01): the Recipes "More actions" is a ui/Menu (replaces RecipesOverflowSheet): Read a recipe, Import, Export, Copy Agent Prompt, Show archived.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubViewportWidth } from '../../../ui/lib/viewport.test-helper'

const copy = vi.hoisted(() => vi.fn())
vi.mock('../../import/hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy }) }))

import { RecipesOverflowMenu, type RecipesOverflowMenuProps } from './RecipesOverflowMenu'

afterEach(() => {
  vi.unstubAllGlobals()
  copy.mockReset()
})

const view = (over: Partial<RecipesOverflowMenuProps> = {}) =>
  render(
    <MemoryRouter>
      <RecipesOverflowMenu showArchived={false} onShowArchivedChange={() => {}} {...over} />
    </MemoryRouter>,
  )
const open = () => userEvent.click(screen.getByRole('button', { name: 'More actions' }))

describe('RecipesOverflowMenu (popover from 768 px)', () => {
  it('is an IconButton "More actions" that opens a menu, not a dialog', async () => {
    view()
    expect(screen.queryByRole('menu')).toBeNull()
    await open()
    expect(screen.getByRole('menu', { name: 'More actions' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('holds Read a recipe, Import and Export (links), Copy Agent Prompt and Show archived, in that order', async () => {
    view()
    await open()
    const menu = screen.getByRole('menu')
    expect(menu.querySelectorAll('[role^="menuitem"]')).toHaveLength(5)
    expect([...menu.querySelectorAll('[role^="menuitem"]')].map((i) => i.textContent)).toEqual([
      'Read a recipe',
      'Import',
      'Export',
      'Copy Agent Prompt',
      'Show archived',
    ])
    const read = screen.getByRole('menuitem', { name: 'Read a recipe' })
    expect(read).toHaveAttribute('href', '/recipes/import#read')
    expect(read.querySelector('svg')).not.toBeNull()
    expect(screen.getByRole('menuitem', { name: 'Import' })).toHaveAttribute('href', '/recipes/import')
    expect(screen.getByRole('menuitem', { name: 'Export' })).toHaveAttribute('href', '/recipes/export')
  })
  it('Copy Agent Prompt copies and closes the menu', async () => {
    view()
    await open()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Copy Agent Prompt' }))
    expect(copy).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).toBeNull()
  })
  it('Show archived is a checkable item that reports the opposite of its state', async () => {
    const onShowArchivedChange = vi.fn()
    view({ onShowArchivedChange })
    await open()
    const box = screen.getByRole('menuitemcheckbox', { name: 'Show archived' })
    expect(box).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(box)
    expect(onShowArchivedChange).toHaveBeenCalledWith(true)
  })
  it('shows Show archived as checked when it is on', async () => {
    view({ showArchived: true })
    await open()
    expect(screen.getByRole('menuitemcheckbox', { name: 'Show archived' })).toHaveAttribute('aria-checked', 'true')
  })
})

describe('RecipesOverflowMenu (sheet below 768 px)', () => {
  it('opens the "More" sheet with the same five entries, Read a recipe first', async () => {
    stubViewportWidth(390)
    view()
    await open()
    const sheet = screen.getByRole('dialog', { name: 'More' })
    expect(within(sheet).getAllByRole('link')[0]).toHaveAccessibleName(/Read a recipe/)
    expect(within(sheet).getByRole('link', { name: /Read a recipe/ })).toHaveAttribute('href', '/recipes/import#read')
    expect(within(sheet).getByRole('link', { name: /Import/ })).toHaveAttribute('href', '/recipes/import')
    expect(within(sheet).getByRole('link', { name: /Export/ })).toHaveAttribute('href', '/recipes/export')
    expect(within(sheet).getByRole('button', { name: /Copy Agent Prompt/ })).toBeInTheDocument()
    expect(within(sheet).getByRole('switch', { name: 'Show archived' })).toHaveAttribute('aria-checked', 'false')
  })
})
