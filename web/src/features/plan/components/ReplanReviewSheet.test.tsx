// B9-26 (PC-01): the sheet "What changed": R-E rows grouped by day, Undo all (secondary) and Keep the changes (primary), one circular Close.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ReplanReviewController } from '../hooks/useReplanReview'
import type { ReviewModel } from '../lib/replan'
import { ReplanReviewSheet } from './ReplanReviewSheet'

const model: ReviewModel = {
  title: 'What changed',
  context: 'After your Swap · 2 other meals',
  lede: 'Your Swap on Tue Breakfast moved 2 other meals. Meals you Pinned or shopped for did not move.',
  days: [
    { date: '2026-11-17', heading: 'Tue 17', rows: [{ key: 'Chicken curry', detail: 'Lunch · Main · was Lentil soup', place: 'Lunch · Main', was: 'was Lentil soup', cell: { date: '2026-11-17', mealSlotId: 2, courseId: 1 } }] },
    {
      date: '2026-11-18', heading: 'Wed 18',
      rows: [{ key: 'Lentil soup', detail: 'Dinner · Main · was Chicken curry', place: 'Dinner · Main', was: 'was Chicken curry', why: 'uses Lentils by Thu', whyIcon: 'useSoon', cell: { date: '2026-11-18', mealSlotId: 3, courseId: 1 } }],
    },
  ],
}

function setup(over: Partial<ReplanReviewController> = {}) {
  const controller: ReplanReviewController = {
    open: true, model, marks: {}, canUndo: true, busy: false, openReview: vi.fn(), keep: vi.fn(), undoAll: vi.fn(async () => true), ...over,
  }
  render(<ReplanReviewSheet controller={controller} />)
  return controller
}
const dialog = () => screen.getByRole('dialog', { name: /What changed/ })

describe('ReplanReviewSheet', () => {
  it('is the dialog "What changed" with the context line and the lede', () => {
    setup()
    expect(dialog()).toHaveTextContent('After your Swap · 2 other meals')
    expect(within(dialog()).getByText(model.lede)).toBeInTheDocument()
  })

  it('groups the rows by day, each day a heading naming its list', () => {
    setup()
    const lists = within(dialog()).getAllByRole('list')
    expect(lists).toHaveLength(2)
    expect(within(dialog()).getByRole('heading', { name: 'Tue 17' })).toBeInTheDocument()
    expect(within(dialog()).getByRole('list', { name: 'Wed 18' })).toBeInTheDocument()
  })

  it('a row is a DetailRow (R-E): the new Recipe as its key, "Lunch · Main · was Lentil soup" as its detail, the first why chip', () => {
    setup()
    const rows = dialog().querySelectorAll('li.detail-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.querySelector('.detail-row__label')).toHaveTextContent('Chicken curry')
    expect(rows[0]!.querySelector('.detail-row__detail')).toHaveTextContent('Lunch · Main · was Lentil soup')
    expect(within(rows[1] as HTMLElement).getByText('uses Lentils by Thu')).toBeInTheDocument()
    expect(dialog().querySelector('li:not(.detail-row)')).toBeNull()
  })

  // Batch w3e review: the mock draws "was …" with its ArrowsClockwise glyph, and the why chip with its glyph as on the Plan.
  it('"was …" carries its glyph and the why chip its own glyph (the mock)', () => {
    setup()
    const rows = dialog().querySelectorAll('li.detail-row')
    expect(rows[0]!.querySelector('.replan-review__was svg')).not.toBeNull()
    expect(rows[0]!.querySelector('.replan-review__was')).toHaveTextContent('was Lentil soup')
    expect(within(rows[1] as HTMLElement).getByText('uses Lentils by Thu').closest('.chip')!.querySelector('svg')).not.toBeNull()
  })

  it('the footer has Undo all (secondary) and Keep the changes (primary); no Cancel; one Close', () => {
    setup()
    const d = within(dialog())
    expect(d.getByRole('button', { name: 'Undo all' })).toHaveAttribute('data-variant', 'secondary')
    expect(d.getByRole('button', { name: 'Keep the changes' })).toHaveAttribute('data-variant', 'primary')
    expect(d.queryByRole('button', { name: 'Cancel' })).toBeNull()
    expect(d.getAllByRole('button', { name: 'Close' })).toHaveLength(1)
  })

  it('Undo all and Keep the changes report to the controller; Close keeps the changes too', async () => {
    const c = setup()
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Undo all' }))
    expect(c.undoAll).toHaveBeenCalledTimes(1)
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Keep the changes' }))
    expect(c.keep).toHaveBeenCalledTimes(1)
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Close' }))
    expect(c.keep).toHaveBeenCalledTimes(2)
  })

  it("another User's changes (no token): no Undo all and no Keep the changes, only the Close", () => {
    setup({ canUndo: false })
    const d = within(dialog())
    expect(d.queryByRole('button', { name: 'Undo all' })).toBeNull()
    expect(d.queryByRole('button', { name: 'Keep the changes' })).toBeNull()
    expect(d.getAllByRole('button', { name: 'Close' })).toHaveLength(1)
  })

  it('while undoing, Undo all is busy and cannot be pressed twice', () => {
    setup({ busy: true })
    expect(within(dialog()).getByRole('button', { name: 'Undo all' })).toHaveAttribute('aria-busy', 'true')
  })

  it('opening it does not put focus on Undo all', () => {
    setup()
    expect(dialog().contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(within(dialog()).getByRole('button', { name: 'Undo all' }))
  })

  it('is not drawn while closed or with nothing to review', () => {
    const { container } = render(<ReplanReviewSheet controller={{ open: false, model: null, marks: {}, canUndo: false, busy: false, openReview: vi.fn(), keep: vi.fn(), undoAll: vi.fn() }} />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
