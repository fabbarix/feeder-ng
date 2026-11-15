// B9-28 (RX-01): the notice at the top of the review. Read-only review: no field to correct a misread here (decision RX 3).
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ImportReviewNotice } from './ImportReviewNotice'

const show = (over: Partial<Parameters<typeof ImportReviewNotice>[0]> = {}) => {
  const onGoToFirst = vi.fn()
  const view = render(<ImportReviewNotice recipes={2} ingredients={9} questions={2} onGoToFirst={onGoToFirst} {...over} />)
  return { onGoToFirst, ...view }
}

describe('ImportReviewNotice', () => {
  it('says how many Recipes and Ingredients, and how many questions are open, as a status', () => {
    show()
    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent('2 Recipes and 9 Ingredients.')
    expect(notice).toHaveTextContent('2 questions to answer before importing.')
  })
  it('offers an outlined secondary "Go to the first question" that calls back', async () => {
    const { onGoToFirst } = show()
    const button = screen.getByRole('button', { name: 'Go to the first question' })
    expect(button).toHaveAttribute('data-variant', 'secondary')
    await userEvent.click(button)
    expect(onGoToFirst).toHaveBeenCalledOnce()
  })
  it('reads 1 question and 1 Recipe in the singular', () => {
    show({ recipes: 1, ingredients: 1, questions: 1 })
    expect(screen.getByRole('status')).toHaveTextContent('1 Recipe and 1 Ingredient.')
    expect(screen.getByRole('status')).toHaveTextContent('1 question to answer before importing.')
  })
  it('with no open question it is ready, in the success tone, with no button', () => {
    show({ questions: 0 })
    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent('2 Recipes and 9 Ingredients, ready to import.')
    expect(notice.closest('[data-status]')).toHaveAttribute('data-status', 'success')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
  it('with open questions it is the info tone, never danger or spoil', () => {
    show()
    expect(screen.getByRole('status').closest('[data-status]')).toHaveAttribute('data-status', 'info')
  })
  it('says every Recipe is skipped when none is left to import', () => {
    show({ recipes: 0, questions: 0, allSkipped: true })
    expect(screen.getByRole('status')).toHaveTextContent('Every Recipe is skipped.')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
