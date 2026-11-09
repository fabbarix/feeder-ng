import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { importStrings as s } from '../strings'
import type { ExportableRecipe } from '../types'
import { ExportPicker } from './ExportPicker'

const recipes: ExportableRecipe[] = [
  { id: 1, name: 'Pancakes', imageUrl: '', archived: false },
  { id: 2, name: 'Porridge', imageUrl: '', archived: false },
]
const props = () => ({ recipes, selected: [] as number[], onToggle: vi.fn(), onSelectAll: vi.fn(), onClear: vi.fn(), href: null as string | null })

describe('ExportPicker', () => {
  it('has no download link while nothing is selected', () => {
    render(<ExportPicker {...props()} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pancakes' })).toHaveAttribute('aria-pressed', 'false')
  })
  it('toggles a Recipe, selects all and clears', async () => {
    const p = props()
    render(<ExportPicker {...p} />)
    await userEvent.click(screen.getByRole('button', { name: 'Porridge' }))
    await userEvent.click(screen.getByRole('button', { name: s.selectAll }))
    await userEvent.click(screen.getByRole('button', { name: s.clearSelection }))
    expect(p.onToggle).toHaveBeenCalledWith(2)
    expect(p.onSelectAll).toHaveBeenCalledOnce()
    expect(p.onClear).toHaveBeenCalledOnce()
  })
  it('links to the download for the pick', () => {
    render(<ExportPicker {...props()} selected={[1]} href="/api/recipe-file/export?ids=1" />)
    const link = screen.getByRole('link', { name: s.exportSelected(1) })
    expect(link).toHaveAttribute('href', '/api/recipe-file/export?ids=1')
    expect(screen.getByRole('button', { name: 'Pancakes' })).toHaveAttribute('aria-pressed', 'true')
  })
  it('names the link "All Recipes" when everything is picked', () => {
    render(<ExportPicker {...props()} selected={[1, 2]} href="/api/recipe-file/export?all=1" />)
    expect(screen.getByRole('link', { name: s.exportAll })).toBeInTheDocument()
  })
  it('says so when there is nothing to export', () => {
    render(<ExportPicker {...props()} recipes={[]} />)
    expect(screen.getByText(s.noRecipes)).toBeInTheDocument()
  })
})
