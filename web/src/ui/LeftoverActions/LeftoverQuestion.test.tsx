import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { leftover, TODAY } from '../../lib/leftovers/fixtures'
import { LeftoverQuestion } from './LeftoverQuestion'

const asked = leftover({ id: 3, recipeName: 'Chilli', useBy: '2026-11-10', toAnswer: true })
const view = (busy = false) => {
  const onAnswer = vi.fn()
  render(<LeftoverQuestion leftover={asked} today={TODAY} busy={busy} onAnswer={onAnswer} />)
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
})
