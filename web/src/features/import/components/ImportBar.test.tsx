// B9-28 (RX-01): the sticky "Import actions" bar (it replaces ConfirmTile). One row at every width.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ImportBar } from './ImportBar'

const show = (over: Partial<Parameters<typeof ImportBar>[0]> = {}) => {
  const on = { onNext: vi.fn(), onImport: vi.fn() }
  const view = render(<ImportBar recipes={2} questions={0} busy={false} {...on} {...over} />)
  return { ...on, ...view }
}
const bar = () => screen.getByRole('group', { name: 'Import actions' })

describe('ImportBar', () => {
  it('is the "Import actions" bar with a primary "Import 2 Recipes" (1 Recipe in the singular)', () => {
    const { rerender, onNext, onImport } = show()
    expect(within(bar()).getByRole('button', { name: 'Import 2 Recipes' })).toHaveAttribute('data-variant', 'primary')
    rerender(<ImportBar recipes={1} questions={0} busy={false} onNext={onNext} onImport={onImport} />)
    expect(within(bar()).getByRole('button', { name: 'Import 1 Recipe' })).toBeEnabled()
  })
  it('imports when nothing is open', async () => {
    const { onImport } = show()
    await userEvent.click(screen.getByRole('button', { name: 'Import 2 Recipes' }))
    expect(onImport).toHaveBeenCalledOnce()
  })
  it('shows "2 questions left" and a secondary "Next question" only while questions are open', () => {
    const { rerender, onNext, onImport } = show({ questions: 2 })
    expect(within(bar()).getByText('2 questions left')).toBeInTheDocument()
    expect(within(bar()).getByRole('button', { name: 'Next question' })).toHaveAttribute('data-variant', 'secondary')
    rerender(<ImportBar recipes={2} questions={0} busy={false} onNext={onNext} onImport={onImport} />)
    expect(screen.queryByText(/left/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next question' })).not.toBeInTheDocument()
  })
  it('Next question asks the screen to move on', async () => {
    const { onNext } = show({ questions: 2 })
    await userEvent.click(screen.getByRole('button', { name: 'Next question' }))
    expect(onNext).toHaveBeenCalledOnce()
  })
  it('keeps "Next question" named when it is icon-only: its label is the accessible name, the visible text may be hidden', () => {
    show({ questions: 1 })
    const next = screen.getByRole('button', { name: 'Next question' })
    expect(next.querySelector('svg')).not.toBeNull()
  })
  it('stays enabled with questions open; pressing it moves to the first question and says how many are left, as a status', async () => {
    const { onImport, onNext } = show({ questions: 2 })
    const primary = screen.getByRole('button', { name: 'Import 2 Recipes' })
    expect(primary).toBeEnabled()
    await userEvent.click(primary)
    expect(onImport).not.toHaveBeenCalled()
    expect(onNext).toHaveBeenCalledOnce()
    expect(within(bar()).getByRole('status')).toHaveTextContent('Answer the 2 questions first')
  })
  it('says "Answer the 1 question first" in the singular, and clears the note once the questions are answered', async () => {
    const { rerender, onNext, onImport } = show({ questions: 1 })
    await userEvent.click(screen.getByRole('button', { name: 'Import 2 Recipes' }))
    expect(within(bar()).getByRole('status')).toHaveTextContent('Answer the 1 question first')
    rerender(<ImportBar recipes={2} questions={0} busy={false} onNext={onNext} onImport={onImport} />)
    expect(within(bar()).queryByText(/Answer the/)).not.toBeInTheDocument()
  })
  it('with no Recipe left to import the primary reads "Nothing to import" and is disabled', () => {
    show({ recipes: 0 })
    expect(screen.getByRole('button', { name: 'Nothing to import' })).toBeDisabled()
  })
  it('while saving the primary is busy and cannot be pressed again', async () => {
    const { onImport } = show({ busy: true })
    const primary = within(bar()).getByRole('button', { name: /Saving/ })
    expect(primary).toBeDisabled()
    await userEvent.click(primary)
    expect(onImport).not.toHaveBeenCalled()
  })
})
