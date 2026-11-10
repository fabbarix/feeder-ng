import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PlannerStyleSlider } from './PlannerStyleSlider'

const slider = () => screen.getByRole('slider', { name: 'Planner Style' })

describe('PlannerStyleSlider (ui Slider, step 0.25, three stops)', () => {
  it('is the shared Slider, not a native range input, with the anchor as its value text', () => {
    const { container } = render(<PlannerStyleSlider value={0.5} onChange={() => {}} />)
    expect(container.querySelector('input[type=range]')).toBeNull()
    expect(slider()).toHaveAttribute('aria-valuemin', '0')
    expect(slider()).toHaveAttribute('aria-valuemax', '1')
    expect(slider()).toHaveAttribute('aria-valuenow', '0.5')
    expect(slider()).toHaveAttribute('aria-valuetext', 'Variety')
  })

  it('labels the three stops under the track', () => {
    render(<PlannerStyleSlider value={0.5} onChange={() => {}} />)
    for (const name of ['Use what we have', 'Variety', 'Favourites']) expect(screen.getAllByText(name).length).toBeGreaterThan(0)
  })

  it('describes positions between anchors in a caption', () => {
    render(<PlannerStyleSlider value={0.75} onChange={() => {}} />)
    expect(screen.getByText('Between Variety and Favourites')).toBeInTheDocument()
  })

  it('moves by 0.25 with the arrows and jumps with Home and End', async () => {
    const onChange = vi.fn()
    render(<PlannerStyleSlider value={0.5} onChange={onChange} />)
    slider().focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith(0.75)
    await userEvent.keyboard('{End}')
    expect(onChange).toHaveBeenLastCalledWith(1)
    await userEvent.keyboard('{Home}')
    expect(onChange).toHaveBeenLastCalledWith(0)
  })

  it('has the three anchors as chips that jump to them', async () => {
    const onChange = vi.fn()
    render(<PlannerStyleSlider value={0.5} onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'Variety' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Favourites' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'Favourites' }))
    expect(onChange).toHaveBeenLastCalledWith(1)
    await userEvent.click(screen.getByRole('button', { name: 'Use what we have' }))
    expect(onChange).toHaveBeenLastCalledWith(0)
  })

  it('disables the slider and every anchor chip, and they do nothing', async () => {
    const onChange = vi.fn()
    render(<PlannerStyleSlider value={0.5} onChange={onChange} disabled />)
    expect(slider()).toHaveAttribute('aria-disabled', 'true')
    slider().focus()
    await userEvent.keyboard('{ArrowRight}')
    for (const name of ['Use what we have', 'Variety', 'Favourites']) {
      const chip = screen.getByRole('button', { name })
      expect(chip).toBeDisabled()
      await userEvent.click(chip)
    }
    expect(onChange).not.toHaveBeenCalled()
  })
})
