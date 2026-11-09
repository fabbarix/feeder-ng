import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { strings } from '../strings'
import type { Conflict } from '../types'
import { MergeConflictList } from './MergeConflictList'

const conflicts: Conflict[] = [
  { kind: 'conversion', unit: 'jar', source: 700, target: 680 },
  { kind: 'shelfLife', unit: '', source: 5, target: 9 },
]

describe('MergeConflictList', () => {
  it('offers both sides of every conflict, nothing preselected', () => {
    render(<MergeConflictList conflicts={conflicts} base="ml" system="metric" answers={{}} onAnswer={() => {}} />)
    expect(screen.getByText(strings.mergeConflictConversion('jar'))).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Keep 700 ml' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Keep 680 ml' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: strings.mergeKeep('5 days') })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: strings.mergeKeep('9 days') })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: strings.mergeKeepNoShelfLife })).not.toBeChecked()
  })
  it('reports answers by conflict key', async () => {
    const onAnswer = vi.fn()
    render(<MergeConflictList conflicts={conflicts} base="ml" system="metric" answers={{}} onAnswer={onAnswer} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Keep 680 ml' }))
    await userEvent.click(screen.getByRole('radio', { name: strings.mergeKeepNoShelfLife }))
    expect(onAnswer).toHaveBeenNthCalledWith(1, 'conversion:jar', 680)
    expect(onAnswer).toHaveBeenNthCalledWith(2, 'shelfLife', null)
  })
  it('shows the chosen answers', () => {
    render(<MergeConflictList conflicts={conflicts} base="ml" system="metric" answers={{ 'conversion:jar': 700, shelfLife: 9 }} onAnswer={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Keep 700 ml' })).toBeChecked()
    expect(screen.getByRole('radio', { name: strings.mergeKeep('9 days') })).toBeChecked()
  })
  it('formats values in the User\'s system', () => {
    render(<MergeConflictList conflicts={[conflicts[0]!]} base="ml" system="imperial" answers={{}} onAnswer={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Keep 3 cups' })).toBeInTheDocument()
  })
})
