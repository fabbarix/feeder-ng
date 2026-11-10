import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Icon, type IconSize, type IconWeight } from './Icon'

// Phosphor draws each weight differently; compare against a reference render rather than markup text.
const svgOf = (weight: IconWeight | undefined, size: IconSize = 20) => {
  const { container, unmount } = render(<Icon name="today" size={size} weight={weight} />)
  const html = container.querySelector('svg')?.innerHTML
  unmount()
  return html
}

describe('Icon weight', () => {
  it.each<[IconSize]>([[14], [16]])('defaults to bold at %i px (dense chips and meta)', (size) => {
    expect(svgOf(undefined, size)).toBe(svgOf('bold', size))
    expect(svgOf(undefined, size)).not.toBe(svgOf('regular', size))
  })

  it.each<[IconSize]>([[20], [22], [24], [28], [64]])('defaults to regular at %i px', (size) => {
    expect(svgOf(undefined, size)).toBe(svgOf('regular', size))
  })

  it('defaults to regular when no size is given (20 px)', () => {
    const { container } = render(<Icon name="today" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '20')
    expect(svg).toHaveAttribute('height', '20')
    expect(svg?.innerHTML).toBe(svgOf('regular'))
  })

  it('honours an explicit weight over the size default', () => {
    expect(svgOf('fill', 16)).not.toBe(svgOf('bold', 16))
    expect(svgOf('duotone', 64)).not.toBe(svgOf('regular', 64))
    expect(svgOf('regular', 14)).not.toBe(svgOf(undefined, 14))
  })

  it('never renders thin or light: the four weights are all distinct', () => {
    const all = (['regular', 'bold', 'fill', 'duotone'] as const).map((w) => svgOf(w))
    expect(new Set(all).size).toBe(4)
  })
})

describe('Icon size and colour', () => {
  it('sets width and height from size', () => {
    const { container } = render(<Icon name="today" size={28} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '28')
    expect(svg).toHaveAttribute('height', '28')
  })

  it('inherits currentColor and takes no colour prop', () => {
    const { container } = render(<Icon name="today" />)
    expect(container.querySelector('svg')).toHaveAttribute('fill', 'currentColor')
  })
})

describe('Icon aria', () => {
  it('is decorative without a label: aria-hidden, no role, no name', () => {
    const { container } = render(<Icon name="today" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).not.toHaveAttribute('role')
    expect(svg).not.toHaveAttribute('aria-label')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('is an img with an accessible name when labelled, and not hidden', () => {
    const { container } = render(<Icon name="today" label="Today" />)
    expect(screen.getByRole('img', { name: 'Today' })).toBe(container.querySelector('svg'))
    expect(container.querySelector('svg')).not.toHaveAttribute('aria-hidden')
  })
})
