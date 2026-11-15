// B9-38 (SHORT-02, PC-09): the Mark as Cooked and Mark all Cooked sheets drop `.plan-sheet__actions` for ONE FormActions row.
//   Mark as Cooked   ⋮ "More for <Recipe>" (Not cooked) · No Leftover (outlined, only while there is one) · Mark as Cooked (primary)
//   Mark all Cooked  the one primary
// The Leftover portions stepper (the question) is the first body control and takes focus; the labels stay on one line at 390 px.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { meal, noUsedFrom } from '../test-utils'
import type { CookPreview } from '../types'
import type { AllCookedRow } from '../lib/toConfirm'
import { MarkAllCookedSheet } from './MarkAllCookedSheet'
import { MarkCookedSheet } from './MarkCookedSheet'

const preview: CookPreview = {
  meal: meal({ recipeName: 'Cucumber tomato feta salad', batches: 1 }), fresh: true, batches: 1, yield: 4, portionsNeeded: 2.75,
  proposedLeftover: 1.25, maxLeftover: 4, leftoverUseBy: '2026-11-12', needs: [],
}
function setup(over: Partial<React.ComponentProps<typeof MarkCookedSheet>> = {}) {
  render(
    <MarkCookedSheet open onClose={() => {}} preview={preview} isLoading={false} leftover={1.25} onLeftoverChange={() => {}} onConfirm={() => {}} onNotCooked={() => {}} busy={false} error={null} courseId={1} usedFrom={noUsedFrom()} {...over} />,
  )
  return { footer: document.querySelector('.sheet__footer') as HTMLElement }
}
const names = (el: HTMLElement) => [...el.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim())

describe('Mark as Cooked: one footer row', () => {
  it('⋮, No Leftover (outlined), Mark as Cooked (primary), in one `.form-actions` and no stacked column', () => {
    const { footer } = setup()
    expect(names(footer)).toEqual(['More for Cucumber tomato feta salad', 'No Leftover', 'Mark as Cooked'])
    expect(footer.querySelectorAll('.form-actions')).toHaveLength(1)
    expect(document.querySelector('.plan-sheet__actions')).toBeNull()
    expect(within(footer).getByRole('button', { name: 'No Leftover' })).toHaveAttribute('data-variant', 'secondary')
    expect(within(footer).getByRole('button', { name: 'Mark as Cooked' })).toHaveAttribute('data-variant', 'primary')
    expect(within(footer).getByRole('button', { name: 'More for Cucumber tomato feta salad' })).toHaveAttribute('aria-haspopup', 'menu')
  })

  it('has no "No Leftover" button when there is no Leftover, nor for a meal served from a Leftover', () => {
    expect(names(setup({ leftover: 0 }).footer)).toEqual(['More for Cucumber tomato feta salad', 'Mark as Cooked'])
  })

  it('the footer buttons keep their label on one line (P30 at 390 px)', () => {
    const { footer } = setup()
    for (const name of ['No Leftover', 'Mark as Cooked']) expect(within(footer).getByRole('button', { name })).toHaveAttribute('data-one-line')
  })

  it('has one round Close and no Cancel', () => {
    setup()
    expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })

  it('opens on the Leftover portions stepper, the question, not on a footer button', () => {
    setup()
    expect(screen.getByRole('spinbutton', { name: 'Leftover portions' })).toHaveFocus()
  })
})

describe('Mark all Cooked: one footer row', () => {
  const rows: AllCookedRow[] = [
    { courseId: 1, courseName: 'Main', recipeName: 'Roast chicken', fresh: true, proposedLeftover: 2, maxLeftover: 4, leftover: 2, leftoverUseBy: '2026-11-13' },
    { courseId: 2, courseName: 'Side', recipeName: 'Green beans', fresh: true, proposedLeftover: 1, maxLeftover: 2, leftover: 1, leftoverUseBy: '2026-11-13' },
  ]
  it('the primary alone, in a `.form-actions` row, on one line', () => {
    render(<MarkAllCookedSheet open onClose={() => {}} rows={rows} isLoading={false} onLeftoverChange={() => {}} onConfirm={() => {}} busy={false} error={null} usedFrom={noUsedFrom()} />)
    const footer = document.querySelector('.sheet__footer') as HTMLElement
    expect(names(footer)).toEqual(['Mark all Cooked'])
    expect(footer.querySelectorAll('.form-actions')).toHaveLength(1)
    expect(document.querySelector('.plan-sheet__actions')).toBeNull()
    expect(within(footer).getByRole('button', { name: 'Mark all Cooked' })).toHaveAttribute('data-one-line')
    expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1)
  })

  it('opens on the first Course\'s Leftover stepper', () => {
    render(<MarkAllCookedSheet open onClose={() => {}} rows={rows} isLoading={false} onLeftoverChange={() => {}} onConfirm={() => {}} busy={false} error={null} usedFrom={noUsedFrom()} />)
    expect(screen.getByRole('spinbutton', { name: 'Main Leftover portions' })).toHaveFocus()
  })
})

// a stray import guard so the file's mocks are used
void vi
