import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { importStrings as s } from '../strings'
import type { UseExportPicker } from '../hooks/useExportPicker'

const hook = vi.hoisted(() => ({ current: {} as UseExportPicker }))
vi.mock('../hooks/useExportPicker', () => ({ useExportPicker: () => hook.current }))

import { ExportScreen } from './ExportScreen'

const base: UseExportPicker = {
  recipes: [{ id: 1, name: 'Pancakes', imageUrl: '', archived: false }], isLoading: false, error: null, selected: [1],
  toggle: vi.fn(), selectAll: vi.fn(), clear: vi.fn(), href: '/api/recipe-file/export?all=1', also: [],
}

describe('ExportScreen', () => {
  it('shows the picker with the download link', () => {
    hook.current = base
    render(<MemoryRouter><ExportScreen /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: s.exportTitle })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Export Recipe File' })).toHaveAttribute('href', '/api/recipe-file/export?all=1')
  })
  it('shows loading and error states', async () => {
    hook.current = { ...base, recipes: [], isLoading: true }
    const { rerender } = render(<MemoryRouter><ExportScreen /></MemoryRouter>)
    expect(await screen.findByRole('status')).toBeInTheDocument()
    hook.current = { ...base, recipes: [], error: new Error('x') }
    rerender(<MemoryRouter><ExportScreen /></MemoryRouter>)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
