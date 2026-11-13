// A line of toggle filter chips in a Filters panel (docs/design/pantry-filter.md 5, 8).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FilterChipGroup } from './FilterChipGroup'

const options = [
  { value: 'pantry', label: 'Pantry', icon: 'stock' as const },
  { value: 'fridge', label: 'Fridge', icon: 'fridge' as const },
  { value: 'freezer', label: 'Freezer' },
]

describe('FilterChipGroup', () => {
  it('is a named group of toggle buttons, pressed as selected', () => {
    render(<FilterChipGroup label="Filter by kind" options={options} selected={['fridge']} onToggle={() => {}} />)
    const group = screen.getByRole('group', { name: 'Filter by kind' })
    expect(group).toHaveClass('filter-chip-group')
    expect(within(group).getByRole('button', { name: 'Fridge' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByRole('button', { name: 'Pantry' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(group).getByRole('button', { name: 'Pantry' }).querySelector('svg')).not.toBeNull()
  })
  it('hands a press to the caller, which decides what it means', async () => {
    const onToggle = vi.fn()
    render(<FilterChipGroup label="Show" options={options} selected={[]} onToggle={onToggle} />)
    await userEvent.click(screen.getByRole('button', { name: 'Freezer' }))
    expect(onToggle).toHaveBeenCalledWith('freezer')
  })
})
