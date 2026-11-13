import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { frozenChilli, leftover, TODAY } from '../../lib/leftovers/fixtures'
import { LeftoverQuestion } from './LeftoverQuestion'

const asked = leftover({ id: 3, recipeName: 'Chilli', useBy: '2026-11-10', toAnswer: true })
const view = (busy = false, l = asked) => {
  const onAnswer = vi.fn()
  render(<LeftoverQuestion leftover={l} today={TODAY} busy={busy} onAnswer={onAnswer} />)
  return { onAnswer }
}

describe('LeftoverQuestion', () => {
  it('asks the decided question', () => {
    view()
    expect(screen.getByText("Chilli was to be used by Tue. Had it, threw it out, or wasn't there?")).toBeInTheDocument()
  })
  it('has the three answers as buttons', () => {
    view()
    expect(['Had it', 'Threw it out', "Wasn't there"].map((n) => screen.getByRole('button', { name: n }).textContent)).toEqual(['Had it', 'Threw it out', "Wasn't there"])
  })
  it.each([
    ['Had it', 'had_it'],
    ['Threw it out', 'threw_out'],
    ["Wasn't there", 'wasnt_there'],
  ])('%s answers %s', async (name, answer) => {
    const { onAnswer } = view()
    await userEvent.click(screen.getByRole('button', { name }))
    expect(onAnswer).toHaveBeenCalledWith(answer, asked)
  })
  it('the buttons are disabled while an answer is saved', () => {
    view(true)
    for (const n of ['Had it', 'Threw it out', "Wasn't there"]) expect(screen.getByRole('button', { name: n })).toBeDisabled()
  })
  it('is in the info tone with the question glyph', () => {
    view()
    expect(screen.getByTestId('leftover-question-3')).toHaveAttribute('data-tone', 'info')
  })
  it('the answers are a group labelled by the question text', () => {
    view()
    const group = screen.getByRole('group', { name: "Chilli was to be used by Tue. Had it, threw it out, or wasn't there?" })
    expect(within(group).getAllByRole('button')).toHaveLength(3)
  })
  it('a frozen Leftover that is to answer shows a badge with its Storage Place', () => {
    view(false, frozenChilli({ id: 3, toAnswer: true, useBy: '2026-11-10' }))
    expect(within(screen.getByTestId('leftover-question-3')).getByText('Garage Freezer')).toBeInTheDocument()
  })
  it('the badge says Not sorted when the Storage Place is gone', () => {
    view(false, frozenChilli({ id: 3, toAnswer: true, useBy: '2026-11-10', storagePlaceId: null, storagePlaceName: null }))
    expect(within(screen.getByTestId('leftover-question-3')).getByText('Not sorted')).toBeInTheDocument()
  })
  it('a Leftover that is not frozen has no badge', () => {
    view()
    expect(screen.queryByText('Not sorted')).toBeNull()
    expect(screen.queryByTestId('leftover-question-badge')).toBeNull()
  })
})
