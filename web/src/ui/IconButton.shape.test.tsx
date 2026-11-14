// B9-01 / DS-12 R-A: IconButton `shape="circle"` (used by CloseButton and the toast dismiss).
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { IconButton } from './IconButton'

describe('IconButton shape', () => {
  it('is a squircle by default (no data-shape)', () => {
    render(<IconButton icon="close" label="Close" />)
    expect(screen.getByRole('button', { name: 'Close' })).not.toHaveAttribute('data-shape')
  })

  it('shape="circle" sets data-shape="circle"', () => {
    render(<IconButton icon="close" label="Close" shape="circle" />)
    expect(screen.getByRole('button', { name: 'Close' })).toHaveAttribute('data-shape', 'circle')
  })
})
