import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { recipe } from '../fixtures.test-helper'
import { importStrings as s } from '../strings'
import { RecipeConflictTile } from './RecipeConflictTile'

const conflict = recipe({ status: 'conflict', resolved: false, existingId: 4 })

describe('RecipeConflictTile', () => {
  it('names the Recipe and offers replace, keep both and skip with nothing pressed', () => {
    render(<RecipeConflictTile recipe={conflict} onChoose={vi.fn()} />)
    expect(screen.getByText(s.conflictTitle('Chicken tikka traybake'))).toBeInTheDocument()
    for (const label of [s.replace, s.keepBoth, s.skip]) {
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false')
    }
  })
  it.each([
    [s.replace, 'replace'],
    [s.keepBoth, 'keep_both'],
    [s.skip, 'skip'],
  ])('reports %s', async (label, action) => {
    const onChoose = vi.fn()
    render(<RecipeConflictTile recipe={conflict} onChoose={onChoose} />)
    await userEvent.click(screen.getByRole('button', { name: label }))
    expect(onChoose).toHaveBeenCalledWith(action)
  })
  it('shows the chosen action and, for keep both, the new name', () => {
    render(<RecipeConflictTile recipe={{ ...conflict, resolved: true, action: 'keep_both', importedAs: 'Chicken tikka traybake (2)' }} onChoose={vi.fn()} />)
    expect(screen.getByRole('button', { name: s.keepBoth })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(s.importedAs('Chicken tikka traybake (2)'))).toBeInTheDocument()
  })
})
