import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { importStrings as s } from '../strings'

vi.mock('../hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy: vi.fn() }) }))

import { RecipeFileActions } from './RecipeFileActions'

describe('RecipeFileActions', () => {
  it('links to Import and Export and offers Copy Agent Prompt', () => {
    render(<MemoryRouter><RecipeFileActions /></MemoryRouter>)
    expect(screen.getByRole('link', { name: s.importAction })).toHaveAttribute('href', '/recipes/import')
    expect(screen.getByRole('link', { name: s.exportAction })).toHaveAttribute('href', '/recipes/export')
    expect(screen.getByRole('button', { name: s.copyAgentPrompt })).toBeInTheDocument()
  })
})
