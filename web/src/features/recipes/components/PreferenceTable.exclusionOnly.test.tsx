import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { PreferenceRow } from '../lib/preferenceRows'
import { PreferenceTable } from './PreferenceTable'

// BR-D (P2 = A): a Base recipe carries only an Exclusion.
const rows = [
  { memberId: 1, name: 'Anna', colour: '#e91e63', avatar: '', isMe: true, state: 'none', fromIngredient: null },
  { memberId: 2, name: 'Ben', colour: '#2196f3', avatar: '', isMe: false, state: 'none', fromIngredient: null },
] as unknown as PreferenceRow[]

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
