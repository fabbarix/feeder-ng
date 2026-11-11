import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { importStrings as s } from '../strings'

vi.mock('../hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy: vi.fn() }) }))

import { RecipeFileActions } from './RecipeFileActions'

describe('RecipeFileActions', () => {
  it('lists Read a recipe, Import, Export and Copy Agent Prompt as rows of one list, Read a recipe first (WP-E)', () => {
    render(<MemoryRouter><RecipeFileActions /></MemoryRouter>)
    const list = screen.getByRole('list', { name: s.sourceTitle })
    expect(list.querySelectorAll('li')).toHaveLength(4)
    expect(list.querySelector('li')).toContainElement(screen.getByRole('link', { name: 'Read a recipe' }))
    expect(screen.getByRole('link', { name: 'Read a recipe' })).toHaveAttribute('href', '/recipes/import#read')
    expect(screen.getByRole('link', { name: s.importAction })).toHaveAttribute('href', '/recipes/import')
    expect(screen.getByRole('link', { name: s.exportAction })).toHaveAttribute('href', '/recipes/export')
    expect(screen.getByRole('button', { name: s.copyAgentPrompt })).toBeInTheDocument()
  })
  it('does not use the retired pill-link markup', () => {
    const { container } = render(<MemoryRouter><RecipeFileActions /></MemoryRouter>)
    expect(container.querySelector('a.button, [data-variant="tonal"]')).toBeNull()
    expect(container.querySelector('.recipe-file-actions')).toBeNull()
  })
})
