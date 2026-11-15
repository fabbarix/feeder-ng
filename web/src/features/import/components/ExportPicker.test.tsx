import { render, screen, within } from '@testing-library/react'
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
const many = (n: number): ExportableRecipe[] => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Recipe ${String(i + 1).padStart(2, '0')}`, imageUrl: '', archived: false }))
const bar = () => screen.getByRole('group', { name: 'Export actions' })

describe('ExportPicker', () => {
  it('lists the Recipes as rows with a thumbnail and a Checkbox as the leading control each', () => {
    const { container } = render(<ExportPicker {...props()} selected={[2]} />)
    expect(screen.getByRole('list', { name: s.exportPick })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Pancakes' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Porridge' })).toBeChecked()
    expect(container.querySelectorAll('.recipe-thumb').length).toBe(2)
    for (const li of container.querySelectorAll('.list-row')) {
      expect(li.querySelector('.list-row__control input[type=checkbox]')).not.toBeNull()
      expect(li.querySelector('.list-row__trailing input[type=checkbox]')).toBeNull()
    }
  })
  it('toggles a Recipe from its checkbox and from anywhere on its row', async () => {
    const p = props()
    render(<ExportPicker {...p} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Porridge' }))
    expect(p.onToggle).toHaveBeenCalledWith(2)
    await userEvent.click(screen.getByText('Pancakes'))
    expect(p.onToggle).toHaveBeenCalledWith(1)
  })
  it('says there is nothing to export when there are no Recipes', () => {
    render(<ExportPicker {...props()} recipes={[]} />)
    expect(screen.getByText(s.noRecipes)).toBeInTheDocument()
  })

  describe('"All Recipes" is a tri-state Checkbox, not a Switch', () => {
    it('is unchecked with "None chosen" when nothing is chosen', () => {
      render(<ExportPicker {...props()} />)
      const all = screen.getByRole('checkbox', { name: 'All Recipes' }) as HTMLInputElement
      expect(all.checked).toBe(false)
      expect(all.indeterminate).toBe(false)
      expect(screen.getByText('None chosen')).toBeInTheDocument()
      expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    })
    it('is mixed with "1 of 2 chosen" when some are chosen', () => {
      render(<ExportPicker {...props()} selected={[1]} />)
      const all = screen.getByRole('checkbox', { name: 'All Recipes' }) as HTMLInputElement
      expect(all.indeterminate).toBe(true)
      expect(screen.getByText('1 of 2 chosen')).toBeInTheDocument()
    })
    it('is checked with "All 2 chosen" when all are chosen', () => {
      render(<ExportPicker {...props()} selected={[1, 2]} />)
      const all = screen.getByRole('checkbox', { name: 'All Recipes' }) as HTMLInputElement
      expect(all.checked).toBe(true)
      expect(all.indeterminate).toBe(false)
      expect(screen.getByText('All 2 chosen')).toBeInTheDocument()
    })
    it('chooses everything when none or some are chosen, and clears when all are', async () => {
      const p = props()
      const { rerender } = render(<ExportPicker {...p} />)
      await userEvent.click(screen.getByRole('checkbox', { name: 'All Recipes' }))
      expect(p.onSelectAll).toHaveBeenCalledTimes(1)
      rerender(<ExportPicker {...p} selected={[1]} />)
      await userEvent.click(screen.getByRole('checkbox', { name: 'All Recipes' }))
      expect(p.onSelectAll).toHaveBeenCalledTimes(2)
      rerender(<ExportPicker {...p} selected={[1, 2]} />)
      await userEvent.click(screen.getByRole('checkbox', { name: 'All Recipes' }))
      expect(p.onClear).toHaveBeenCalledTimes(1)
    })
  })

  describe('the sticky bar is always there (RX-15)', () => {
    it('with none chosen: a disabled "Export Recipes" button described by "Choose at least one Recipe"', () => {
      render(<ExportPicker {...props()} />)
      const button = within(bar()).getByRole('button', { name: 'Export Recipes' })
      expect(button).toBeDisabled()
      const described = button.getAttribute('aria-describedby')
      expect(described).toBeTruthy()
      expect(document.getElementById(described!)).toHaveTextContent('Choose at least one Recipe')
      expect(screen.queryByRole('link', { name: /Export/ })).not.toBeInTheDocument()
    })
    it('with some chosen: the primary download link "Export 1 Recipe" and the count in the meta, announced as a status', () => {
      render(<ExportPicker {...props()} selected={[1]} href="/api/recipe-file/export?ids=1" />)
      const link = within(bar()).getByRole('link', { name: 'Export 1 Recipe' })
      expect(link).toHaveAttribute('href', '/api/recipe-file/export?ids=1')
      expect(link).toHaveAttribute('data-variant', 'primary')
      expect(link).toHaveClass('button')
      expect(link.closest('.form-actions__primary')).not.toBeNull()
      expect(within(bar()).getByRole('status')).toHaveTextContent('1 Recipe')
    })
    it('reads "Export 2 Recipes" for the whole list', () => {
      render(<ExportPicker {...props()} selected={[1, 2]} href="/api/recipe-file/export?all=1" />)
      expect(within(bar()).getByRole('link', { name: 'Export 2 Recipes' })).toHaveAttribute('href', '/api/recipe-file/export?all=1')
    })
    it('adds the Base recipes to the meta: "3 Recipes and 1 Base recipe"', () => {
      render(<ExportPicker {...props()} recipes={many(4)} selected={[1, 2, 3]} href="/x" also={[{ id: 90, name: 'Tomato passata base' }]} />)
      expect(within(bar()).getByRole('status')).toHaveTextContent('3 Recipes and 1 Base recipe')
    })
    it('keeps the note that names the Base recipe the export also carries', () => {
      render(<ExportPicker {...props()} selected={[1]} href="/x" also={[{ id: 90, name: 'Tomato passata base' }]} />)
      expect(screen.getByRole('list', { name: s.baseRecipes.alsoExports })).toBeInTheDocument()
    })
  })

  describe('search', () => {
    it('has no search field for 12 Recipes or fewer', () => {
      render(<ExportPicker {...props()} recipes={many(12)} />)
      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    })
    it('has a search field above 12 Recipes that narrows the rows', async () => {
      render(<ExportPicker {...props()} recipes={many(13)} />)
      const search = screen.getByRole('searchbox', { name: 'Search Recipes' })
      await userEvent.type(search, 'Recipe 13')
      expect(screen.queryByRole('checkbox', { name: 'Recipe 01' })).not.toBeInTheDocument()
      expect(screen.getByRole('checkbox', { name: 'Recipe 13' })).toBeInTheDocument()
    })
  })
})
