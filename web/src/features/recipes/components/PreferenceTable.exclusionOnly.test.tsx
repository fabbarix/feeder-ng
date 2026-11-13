import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { PreferenceRow } from '../lib/preferenceRows'
import { PreferenceTable } from './PreferenceTable'

// BR-D (P2 = A): a Base recipe carries only an Exclusion.
const member = (id: number, name: string) => ({ id, name, colour: '#e91e63', avatar: '', userId: id === 1 ? 10 : null })
const rows: PreferenceRow[] = [
  { member: member(1, 'Anna'), you: true, state: 'none', via: [] },
  { member: member(2, 'Ben'), you: false, state: 'none', via: [] },
]

describe('PreferenceTable exclusionOnly', () => {
  it('shows the Member and Exclusion columns only', () => {
    render(<MemoryRouter><PreferenceTable recipeName="Béchamel" rows={rows} onToggle={() => {}} exclusionOnly /></MemoryRouter>)
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent?.trim())).toEqual(['Member', 'Exclusion'])
    expect(screen.queryByRole('button', { name: 'Anna: Favourite' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ben: Dislike' })).toBeNull()
  })
  it('still toggles an Exclusion', async () => {
    const onToggle = vi.fn()
    render(<MemoryRouter><PreferenceTable recipeName="Béchamel" rows={rows} onToggle={onToggle} exclusionOnly /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: 'Ben: Exclusion' }))
    expect(onToggle).toHaveBeenCalledWith(2, 'exclusion')
  })
})
