import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Slider } from './Slider'

describe('WP3b #12: Slider valueText', () => {
  const minutes = (v: number) => `${v} min`
  it('sets aria-valuetext and shows the same text as a visible caption', () => {
    render(<Slider label="Cooking time" min={10} max={120} step={5} value={45} valueText={minutes} onChange={() => {}} />)
    expect(screen.getByRole('slider', { name: 'Cooking time' })).toHaveAttribute('aria-valuetext', '45 min')
    expect(screen.getByText('45 min')).toBeVisible()
  })
  it('wins over a stop label for the caption and valuetext', () => {
    render(<Slider label="Planner Style" min={0} max={2} value={1} stops={[{ value: 1, label: 'Balanced' }]} valueText={(v) => `Level ${v}`} onChange={() => {}} />)
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'Level 1')
  })
  it('follows the value', () => {
    const { rerender } = render(<Slider label="T" min={0} max={9} value={2} valueText={minutes} onChange={() => {}} />)
    rerender(<Slider label="T" min={0} max={9} value={7} valueText={minutes} onChange={() => {}} />)
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '7 min')
    expect(screen.queryByText('2 min')).toBeNull()
  })
  it('without valueText there is no extra caption (unchanged)', () => {
    const { container } = render(<Slider label="T" min={0} max={9} value={2} onChange={() => {}} />)
    expect(container.querySelector('.slider__caption')).toBeNull()
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '2')
  })
})
