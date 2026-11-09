import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PlannerStyleSlider } from './PlannerStyleSlider'

describe('PlannerStyleSlider', () => {
  it('is a slider named Planner Style that reads out the anchor', () => {
    render(<PlannerStyleSlider value={0.5} onChange={() => {}} />)
    const slider = screen.getByRole('slider', { name: 'Planner Style' })
    expect(slider).toHaveAttribute('min', '0')
    expect(slider).toHaveAttribute('max', '1')
    expect(slider).toHaveAttribute('aria-valuetext', 'Variety')
  })

  it('describes positions between anchors', () => {
    render(<PlannerStyleSlider value={0.8} onChange={() => {}} />)
    expect(screen.getByRole('slider', { name: 'Planner Style' })).toHaveAttribute('aria-valuetext', 'Between Variety and Favourites')
  })

  it('reports slider moves, snapping near an anchor', () => {
    const onChange = vi.fn()
    render(<PlannerStyleSlider value={0.5} onChange={onChange} />)
    const slider = screen.getByRole('slider', { name: 'Planner Style' })
    fireEvent.change(slider, { target: { value: '0.8' } })
    expect(onChange).toHaveBeenLastCalledWith(0.8)
    fireEvent.change(slider, { target: { value: '0.98' } })
    expect(onChange).toHaveBeenLastCalledWith(1)
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

  it('can be disabled', () => {
    render(<PlannerStyleSlider value={0.5} onChange={() => {}} disabled />)
    expect(screen.getByRole('slider', { name: 'Planner Style' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Favourites' })).toBeDisabled()
  })
})
