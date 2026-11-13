// BR-E: "Also exports Béchamel (Base recipe)" in the Export picker (design §11.1, §13). RED until ExportPicker takes `also`.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ExportPicker } from './ExportPicker'

const recipes = [
  { id: 1, name: 'Lasagne', imageUrl: '', archived: false },
  { id: 2, name: 'Salad', imageUrl: '', archived: false },
]
const show = (also: Array<{ id: number; name: string }>) =>
  render(<ExportPicker recipes={recipes} selected={[1]} onToggle={vi.fn()} onSelectAll={vi.fn()} onClear={vi.fn()} href="/api/recipe-file/export?ids=1" also={also} />)

describe('ExportPicker, Also exports', () => {
  it('says nothing when no Base recipe comes along', () => {
    show([])
    expect(screen.queryByText(/Also exports/)).toBeNull()
  })

  it('names each Base recipe the export adds', () => {
    show([{ id: 10, name: 'Béchamel' }, { id: 12, name: 'Roux' }])
    const list = screen.getByRole('list', { name: 'Also exports' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Also exports Béchamel (Base recipe)', 'Also exports Roux (Base recipe)'])
  })

  it('does not list Base recipes as rows to tick: the picker keeps the Recipes you plan', () => {
    show([{ id: 10, name: 'Béchamel' }])
    expect(screen.queryByRole('checkbox', { name: 'Béchamel' })).toBeNull()
    expect(screen.getAllByRole('checkbox', { name: /^(Lasagne|Salad)$/ })).toHaveLength(2)
  })

  it('keeps the download action', () => {
    show([{ id: 10, name: 'Béchamel' }])
    expect(screen.getByRole('link', { name: 'Export Recipe File' })).toHaveAttribute('href', '/api/recipe-file/export?ids=1')
  })
})
