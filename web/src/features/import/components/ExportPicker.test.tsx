import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { importStrings as s } from '../strings'
import type { ExportableRecipe } from '../types'
import { ExportPicker } from './ExportPicker'

const recipes: ExportableRecipe[] = [
  { id: 1, name: 'Pancakes', imageUrl: '/api/images/p', archived: false },
  { id: 2, name: 'Porridge', imageUrl: '', archived: false },
]
const props = () => ({ recipes, selected: [] as number[], onToggle: vi.fn(), onSelectAll: vi.fn(), onClear: vi.fn(), href: null as string | null })

describe('ExportPicker', () => {
  it('lists the Recipes as rows with a thumbnail and a Checkbox each', () => {
    const { container } = render(<ExportPicker {...props()} selected={[2]} />)
    expect(screen.getByRole('list', { name: s.exportPick })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Pancakes' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Porridge' })).toBeChecked()
    expect(container.querySelectorAll('.recipe-thumb').length).toBe(2)
  })
  it('has no download link while nothing is selected', () => {
    render(<ExportPicker {...props()} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
  it('toggles a Recipe', async () => {
    const p = props()
    render(<ExportPicker {...p} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Porridge' }))
    expect(p.onToggle).toHaveBeenCalledWith(2)
  })
  it('selects and clears everything with the "All Recipes" Switch', async () => {
    const p = props()
    const { rerender } = render(<ExportPicker {...p} />)
    const sw = screen.getByRole('switch', { name: s.allRecipes })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(sw)
    expect(p.onSelectAll).toHaveBeenCalledOnce()
    rerender(<ExportPicker {...p} selected={[1, 2]} />)
    expect(screen.getByRole('switch', { name: s.allRecipes })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(screen.getByRole('switch', { name: s.allRecipes }))
    expect(p.onClear).toHaveBeenCalledOnce()
  })
  it('links to the download for the pick', () => {
    render(<ExportPicker {...props()} selected={[1]} href="/api/recipe-file/export?ids=1" />)
    expect(screen.getByRole('link', { name: s.exportSelected(1) })).toHaveAttribute('href', '/api/recipe-file/export?ids=1')
  })
  it('names the link for everything when all are picked', () => {
    render(<ExportPicker {...props()} selected={[1, 2]} href="/api/recipe-file/export?all=1" />)
    expect(screen.getByRole('link', { name: s.exportAll })).toBeInTheDocument()
  })
  it('says so when there is nothing to export', () => {
    render(<ExportPicker {...props()} recipes={[]} />)
    expect(screen.getByText(s.noRecipes)).toBeInTheDocument()
  })
})
