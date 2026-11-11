// R2-4 (Import part, /recipes/export). NEW FILE, red until the Import edits are applied (design note, "Deferred Import edits").
// Loading is the shared Skeleton, an empty list the shared EmptyState, and the download is a StickyActionBar on a long list.
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseExportPicker } from '../hooks/useExportPicker'

const hook = vi.hoisted(() => ({ picker: {} as UseExportPicker }))
vi.mock('../hooks/useExportPicker', () => ({ useExportPicker: () => hook.picker }))

import { ExportScreen } from './ExportScreen'

const base = (): UseExportPicker => ({ recipes: [], isLoading: false, error: null, selected: [], toggle: vi.fn(), selectAll: vi.fn(), clear: vi.fn(), href: null })
const view = () => render(<MemoryRouter><ExportScreen /></MemoryRouter>)

beforeEach(() => {
  hook.picker = base()
})

describe('ExportScreen states', () => {
  it('loading is a Skeleton, not a bare paragraph', async () => {
    hook.picker = { ...base(), isLoading: true }
    view()
    // The Skeleton shows after its anti-flash delay (300 ms).
    await waitFor(() => expect(document.querySelector('.skeleton-group')).not.toBeNull())
    expect(screen.queryByText('Loading…')).toBeNull()
  })
  it('no Recipes is an EmptyState', () => {
    view()
    expect(document.querySelector('.empty-state')).not.toBeNull()
  })
  it('the download is the primary of a sticky action bar once something is selected', () => {
    hook.picker = {
      ...base(),
      recipes: [{ id: 1, name: 'Soup', imageUrl: '', archived: false }],
      selected: [1],
      href: '/api/recipe-file/export?ids=1',
    }
    view()
    const bar = screen.getByRole('group', { name: 'Export actions' })
    expect(bar).toHaveClass('sticky-action-bar')
    const link = screen.getByRole('link', { name: 'Export Recipe File' })
    expect(link.closest('.form-actions__primary')).not.toBeNull()
    expect(link).toHaveAttribute('href', '/api/recipe-file/export?ids=1')
  })
})
